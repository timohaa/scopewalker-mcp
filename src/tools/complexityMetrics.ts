import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Parser from "tree-sitter";
import { z } from "zod";
import { findFiles } from "../lib/glob.js";
import { detectLanguage, parseCode } from "../lib/treeSitter.js";
import type { ComplexityMetricsResult, FileComplexity, SupportedLanguage } from "../types/index.js";
import { isFileWithinSizeLimit } from "../utils/fileGuards.js";
import { validatePath } from "../utils/paths.js";
import { createErrorResponse, createSuccessResponse } from "../utils/responses.js";
import {
  walkNode,
  calculateNestingDepth,
  countParameters,
  countJsxProps,
  countDependencies,
  calculateCognitiveComplexity,
  findHotspots,
  calculateSummary,
} from "./complexityMetricsHelpers.js";

const DEFAULT_LIMIT = 20;

const inputSchema = {
  path: z.string().describe("Target path"),
  include_hidden: z.boolean().optional().describe("Include hidden"),
  ignore_patterns: z.array(z.string()).optional().describe("Exclude patterns"),
  extensions: z.array(z.string()).optional().describe("Filter by extensions"),
  max_depth: z.number().int().positive().optional().describe("Max depth"),
  max_files: z.number().int().positive().optional().describe("Max files to scan"),
  metrics: z
    .array(z.enum(["nesting_depth", "parameters", "dependencies", "cognitive"]))
    .optional()
    .describe("Metrics to calculate"),
  summary_only: z.boolean().optional().describe("Summary only"),
  limit: z.number().int().positive().optional().describe("Max results"),
};

/** Registers the get_complexity_metrics tool for nesting, parameters, and cognitive complexity. */
export function registerComplexityMetricsTool(server: McpServer): void {
  server.registerTool(
    "get_complexity_metrics",
    {
      description:
        "Returns complexity metrics (nesting, params, cognitive). Use limit/summary_only to control output.",
      inputSchema,
    },
    async (args) => {
      const pathValidation = await validatePath(args.path);
      if (!pathValidation.valid) {
        return createErrorResponse(pathValidation.error);
      }

      const { resolvedPath, isDirectory } = pathValidation;

      let filePaths: string[];
      if (isDirectory) {
        filePaths = await findFiles({
          cwd: resolvedPath,
          includeHidden: args.include_hidden,
          ignorePatterns: args.ignore_patterns,
          extensions: args.extensions,
          maxDepth: args.max_depth,
        });
      } else {
        filePaths = [resolvedPath];
      }

      if (args.max_files !== undefined && args.max_files > 0 && filePaths.length > args.max_files) {
        filePaths = filePaths.slice(0, args.max_files);
      }

      const allFiles = await analyzeComplexity(filePaths, resolvedPath, isDirectory);
      const summary = calculateSummary(allFiles);

      // Sort by cognitive complexity (highest first) for limiting
      const sortedFiles = [...allFiles].sort(
        (a, b) => b.metrics.cognitive_complexity - a.metrics.cognitive_complexity
      );

      // Apply limit (default: 20)
      const limit = args.limit ?? DEFAULT_LIMIT;
      const limitedFiles = sortedFiles.slice(0, limit);

      const result: ComplexityMetricsResult = {
        path: resolvedPath,
        files: args.summary_only === true ? [] : limitedFiles,
        summary,
      };

      return createSuccessResponse(result, { itemCount: limitedFiles.length });
    }
  );
}

/** Parses files and calculates complexity metrics for each. */
async function analyzeComplexity(
  filePaths: string[],
  basePath: string,
  isDirectory: boolean
): Promise<FileComplexity[]> {
  const results: FileComplexity[] = [];

  for (const filePath of filePaths) {
    const fullPath = isDirectory ? join(basePath, filePath) : filePath;
    const relativePath = isDirectory ? filePath : fullPath;
    const language = detectLanguage(fullPath);

    if (!language) continue;

    try {
      const withinLimit = await isFileWithinSizeLimit(fullPath);
      if (!withinLimit) continue;

      const code = await readFile(fullPath, "utf-8");
      const tree = await parseCode(code, language);
      if (!tree) continue;

      const metrics = await calculateMetrics(tree.rootNode, code, language);
      const hotspots = findHotspots(tree.rootNode, language);

      results.push({
        path: relativePath,
        metrics,
        hotspots,
      });
    } catch {
      // Skip files that can't be read
    }
  }

  return results;
}

/** Computes nesting, parameter, dependency, and cognitive complexity metrics. */
async function calculateMetrics(
  rootNode: Parser.SyntaxNode,
  code: string,
  language: SupportedLanguage
): Promise<FileComplexity["metrics"]> {
  const nestingDepths: number[] = [];
  const paramCounts: number[] = [];

  walkNode(rootNode, (node) => {
    const depth = calculateNestingDepth(node, 0);
    if (depth > 0) {
      nestingDepths.push(depth);
    }

    const params = countParameters(node, language);
    if (params !== null) {
      paramCounts.push(params);
    }

    const jsxProps = countJsxProps(node);
    if (jsxProps !== null) {
      paramCounts.push(jsxProps);
    }
  });

  const maxNesting = nestingDepths.length > 0 ? Math.max(...nestingDepths) : 0;
  const avgNesting =
    nestingDepths.length > 0 ? nestingDepths.reduce((a, b) => a + b, 0) / nestingDepths.length : 0;

  const maxParams = paramCounts.length > 0 ? Math.max(...paramCounts) : 0;
  const avgParams =
    paramCounts.length > 0 ? paramCounts.reduce((a, b) => a + b, 0) / paramCounts.length : 0;

  const depCount = await countDependencies(code, language);
  const cognitive = calculateCognitiveComplexity(rootNode);

  return {
    max_nesting_depth: maxNesting,
    avg_nesting_depth: Math.round(avgNesting * 10) / 10,
    max_parameters: maxParams,
    avg_parameters: Math.round(avgParams * 10) / 10,
    dependency_count: depCount,
    cognitive_complexity: cognitive,
  };
}

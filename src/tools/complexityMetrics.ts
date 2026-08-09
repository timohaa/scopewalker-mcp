import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Parser from "tree-sitter";
import { z } from "zod";
import { findFiles } from "../lib/glob.js";
import { walkSourceFiles } from "../lib/sourceFileWalker.js";
import { parseCode } from "../lib/treeSitter.js";
import type { ComplexityMetricsResult, FileComplexity, SupportedLanguage } from "../types/index.js";
import { validatePath } from "../utils/paths.js";
import { createErrorResponse, createSuccessResponse } from "../utils/responses.js";
import {
  collectFunctions,
  rollUpFunctionMetrics,
  selectReportedFunctions,
  HIGH_CYCLOMATIC_THRESHOLD,
  type FunctionAnalysis,
} from "./complexityMetricsFunctions.js";
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
import type { FunctionStats } from "./complexityMetricsHotspots.js";

const DEFAULT_LIMIT = 20;

const inputSchema = {
  path: z.string().describe("Target path"),
  include_hidden: z.boolean().optional().describe("Include hidden"),
  ignore_patterns: z.array(z.string()).optional().describe("Exclude patterns"),
  extensions: z.array(z.string()).optional().describe("Filter by extensions"),
  max_depth: z.number().int().positive().optional().describe("Max depth"),
  max_files: z.number().int().positive().optional().describe("Max files to scan"),
  summary_only: z.boolean().optional().describe("Summary only"),
  limit: z.number().int().positive().optional().describe("Max results"),
};

/** Registers the get_complexity_metrics tool for nesting, parameters, and cognitive complexity. */
export function registerComplexityMetricsTool(server: McpServer): void {
  server.registerTool(
    "get_complexity_metrics",
    {
      description:
        "Returns complexity metrics (nesting, params, cognitive, per-function cyclomatic). Use limit/summary_only to control output.",
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

      const { files: allFiles, functionStats } = await analyzeComplexity(
        filePaths,
        resolvedPath,
        isDirectory,
        args.max_files
      );
      const summary = calculateSummary(allFiles, functionStats);

      // Sort by cognitive complexity so the highest-complexity files appear first after slicing
      const sortedFiles = [...allFiles].sort(
        (a, b) => b.metrics.cognitive_complexity - a.metrics.cognitive_complexity
      );

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

/**
 * Parses files and calculates complexity metrics for each.
 *
 * Function tallies accumulate as files are processed rather than from the returned
 * records: those are capped per file and the caller then slices them by `limit`,
 * while the summary has to describe every function that was analysed.
 */
async function analyzeComplexity(
  filePaths: string[],
  basePath: string,
  isDirectory: boolean,
  maxFiles?: number
): Promise<{ files: FileComplexity[]; functionStats: FunctionStats }> {
  const results: FileComplexity[] = [];
  const functionStats: FunctionStats = {
    highComplexityFunctions: 0,
    mostComplexFunction: null,
  };

  for await (const { relativePath, language, code } of walkSourceFiles(
    filePaths,
    basePath,
    isDirectory,
    maxFiles
  )) {
    const tree = await parseCode(code, language);
    if (!tree) continue;

    const functions = collectFunctions(tree.rootNode, language);
    const metrics = await calculateMetrics(tree.rootNode, code, language, functions);
    const hotspots = findHotspots(tree.rootNode, functions);
    accumulateFunctionStats(functionStats, functions, relativePath);

    results.push({
      path: relativePath,
      metrics,
      functions: selectReportedFunctions(functions),
      hotspots,
    });
  }

  return { files: results, functionStats };
}

/** Folds one file's functions into the running cross-file tallies. */
function accumulateFunctionStats(
  stats: FunctionStats,
  functions: FunctionAnalysis[],
  path: string
): void {
  for (const fn of functions) {
    if (fn.cyclomatic > HIGH_CYCLOMATIC_THRESHOLD) {
      stats.highComplexityFunctions++;
    }

    if (
      !stats.mostComplexFunction ||
      fn.cyclomatic > stats.mostComplexFunction.cyclomatic_complexity
    ) {
      stats.mostComplexFunction = {
        path,
        function: fn.name,
        line: fn.line,
        cyclomatic_complexity: fn.cyclomatic,
      };
    }
  }
}

/** Computes nesting, parameter, dependency, cognitive, and per-function roll-up metrics. */
async function calculateMetrics(
  rootNode: Parser.SyntaxNode,
  code: string,
  language: SupportedLanguage,
  functions: FunctionAnalysis[]
): Promise<FileComplexity["metrics"]> {
  const nestingDepths: number[] = [];
  const paramCounts: number[] = [];

  walkNode(rootNode, (node) => {
    const depth = calculateNestingDepth(node, 0, language);
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
    ...rollUpFunctionMetrics(functions),
  };
}

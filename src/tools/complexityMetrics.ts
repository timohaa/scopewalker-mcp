import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type Parser from "tree-sitter";
import { findFiles } from "../lib/glob.js";
import { walkSourceFiles, type SourceScan } from "../lib/sourceFileWalker.js";
import { detectLanguage, parseCode } from "../lib/treeSitter.js";
import {
  type ComplexityMetricsResult,
  complexityMetricsResultSchema,
  type FileComplexity,
  type SupportedLanguage,
} from "../types/index.js";
import { validatePath } from "../utils/paths.js";
import {
  createErrorResponse,
  createSuccessResponse,
  READ_ONLY_ANNOTATIONS,
  withResponseMeta,
} from "../utils/responses.js";
import {
  extensionsSchema,
  ignorePatternsSchema,
  includeHiddenSchema,
  limitSchema,
  maxDepthSchema,
  maxFilesSchema,
  pathSchema,
  summaryOnlySchema,
} from "../utils/schemaLimits.js";
import {
  collectFunctions,
  rollUpFunctionMetrics,
  selectReportedFunctions,
  HIGH_CYCLOMATIC_THRESHOLD,
  type FunctionAnalysis,
} from "./complexityMetricsFunctions.js";
import {
  walkNode,
  countParameters,
  countJsxProps,
  countDependencies,
  calculateCognitiveComplexity,
  findHotspots,
  calculateSummary,
} from "./complexityMetricsHelpers.js";
import type { FunctionStats } from "./complexityMetricsHotspots.js";
import { collectSubtreeNestingDepths } from "./complexityMetricsNesting.js";

const DEFAULT_LIMIT = 20;

const inputSchema = {
  path: pathSchema,
  include_hidden: includeHiddenSchema,
  ignore_patterns: ignorePatternsSchema,
  extensions: extensionsSchema,
  max_depth: maxDepthSchema,
  max_files: maxFilesSchema,
  summary_only: summaryOnlySchema,
  limit: limitSchema.describe("Max files returned, most complex first (default 20)"),
};

/** Registers the get_complexity_metrics tool for nesting, parameters, and cognitive complexity. */
export function registerComplexityMetricsTool(server: McpServer): void {
  server.registerTool(
    "get_complexity_metrics",
    {
      title: "Complexity Metrics",
      description:
        "Returns complexity metrics (nesting, params, cognitive, per-function cyclomatic). Use limit/summary_only to control output.",
      inputSchema,
      outputSchema: withResponseMeta(complexityMetricsResultSchema),
      annotations: READ_ONLY_ANNOTATIONS,
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

      const { files: allFiles, functionStats } = await analyzeComplexity({
        filePaths,
        basePath: resolvedPath,
        isDirectory,
        maxFiles: args.max_files,
      });
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
  scan: SourceScan
): Promise<{ files: FileComplexity[]; functionStats: FunctionStats }> {
  const results: FileComplexity[] = [];
  const functionStats: FunctionStats = {
    highComplexityFunctions: 0,
    mostComplexFunction: null,
  };

  for await (const { fullPath, relativePath, language: byExtension, code } of walkSourceFiles(
    scan
  )) {
    try {
      // walkSourceFiles goes by extension alone, which sends every C++ header to
      // the C grammar; re-detecting with the source in hand fixes `.h`.
      const language = detectLanguage(fullPath, code) ?? byExtension;
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
    } catch {
      // One unparsable file must not abort the scan.
      continue;
    }
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
  // One pass for every node's subtree depth; calling calculateNestingDepth per
  // node instead re-walked each subtree and dominated the tool's runtime.
  const nestingDepths = collectSubtreeNestingDepths(rootNode, language);
  const paramCounts: number[] = [];

  walkNode(rootNode, (node) => {
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

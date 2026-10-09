import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findFiles } from "../lib/glob.js";
import type {
  PropDrillingResult,
  FileParameterAnalysis,
  ThreadedParameter,
} from "../types/propDrilling.js";
import { validatePath } from "../utils/paths.js";
import {
  createErrorResponse,
  createSuccessResponse,
  READ_ONLY_ANNOTATIONS,
} from "../utils/responses.js";
import {
  boundedInt,
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
  analyzeFilesForParameters,
  aggregateParameters,
  COMMON_PARAMETER_NAMES,
} from "./propDrillingAnalysis.js";

const DEFAULT_LIMIT = 20;
const DEFAULT_MIN_OCCURRENCES = 3;

/** Aggregates per-file parameters into the threaded list, optionally dropping common names. */
function selectThreadedParameters(
  fileAnalyses: FileParameterAnalysis[],
  options: { minOccurrences: number; excludeCommon: boolean }
): ThreadedParameter[] {
  const threaded = aggregateParameters(fileAnalyses, options.minOccurrences);

  return options.excludeCommon
    ? threaded.filter((p) => !COMMON_PARAMETER_NAMES.has(p.name))
    : threaded;
}

const inputSchema = {
  path: pathSchema,
  include_hidden: includeHiddenSchema,
  ignore_patterns: ignorePatternsSchema,
  extensions: extensionsSchema,
  max_depth: maxDepthSchema,
  max_files: maxFilesSchema,
  limit: limitSchema.describe("Max parameters returned (default 20)"),
  min_occurrences: boundedInt(1_000).describe("Minimum function occurrences to flag (default 3)"),
  exclude_common: z
    .boolean()
    .optional()
    .describe("Exclude common parameter names like id, key, className (default false)"),
  summary_only: summaryOnlySchema,
};

/** Registers the get_prop_drilling tool for detecting parameter threading. */
export function registerPropDrillingTool(server: McpServer): void {
  server.registerTool(
    "get_prop_drilling",
    {
      title: "Prop Drilling",
      description:
        "Detects parameter threading (prop drilling) by finding parameter names passed through chains of functions. Use limit/summary_only to control output.",
      inputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => {
      const pathValidation = await validatePath(args.path);
      if (!pathValidation.valid) {
        return createErrorResponse(pathValidation.error);
      }

      const { resolvedPath, isDirectory } = pathValidation;

      const filePaths = isDirectory
        ? await findFiles({
            cwd: resolvedPath,
            includeHidden: args.include_hidden,
            ignorePatterns: args.ignore_patterns,
            extensions: args.extensions,
            maxDepth: args.max_depth,
          })
        : [resolvedPath];

      const { fileAnalyses, totalParamsScanned } = await analyzeFilesForParameters({
        filePaths,
        basePath: resolvedPath,
        isDirectory,
        maxFiles: args.max_files,
      });

      const threaded = selectThreadedParameters(fileAnalyses, {
        minOccurrences: args.min_occurrences ?? DEFAULT_MIN_OCCURRENCES,
        excludeCommon: args.exclude_common === true,
      });

      const limit = args.limit ?? DEFAULT_LIMIT;
      const limited = threaded.slice(0, limit);
      const [top] = threaded;

      const result: PropDrillingResult = {
        path: resolvedPath,
        is_directory: isDirectory,
        threaded_parameters: args.summary_only === true ? [] : limited,
        summary: {
          files_analyzed: fileAnalyses.length,
          total_parameters_scanned: totalParamsScanned,
          // Summary totals describe the full list; limit only trims the returned details
          threaded_parameters_found: threaded.length,
          highest_occurrence: top !== undefined ? { name: top.name, count: top.occurrences } : null,
        },
      };

      return createSuccessResponse(result, { itemCount: limited.length });
    }
  );
}

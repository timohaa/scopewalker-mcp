import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findFiles } from "../lib/glob.js";
import type { PropDrillingResult, FileParameterAnalysis } from "../types/propDrilling.js";
import { validatePath } from "../utils/paths.js";
import { createErrorResponse, createSuccessResponse } from "../utils/responses.js";
import {
  analyzeFile,
  aggregateParameters,
  COMMON_PARAMETER_NAMES,
} from "./propDrillingAnalysis.js";

const DEFAULT_LIMIT = 20;
const DEFAULT_MIN_OCCURRENCES = 3;

const inputSchema = {
  path: z.string().describe("Target path"),
  include_hidden: z.boolean().optional().describe("Include hidden"),
  ignore_patterns: z.array(z.string()).optional().describe("Exclude patterns"),
  extensions: z.array(z.string()).optional().describe("Filter by extensions"),
  max_depth: z.number().int().positive().optional().describe("Max depth"),
  max_files: z.number().int().positive().optional().describe("Max files to scan"),
  limit: z.number().int().positive().optional().describe("Max results"),
  min_occurrences: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Minimum function occurrences to flag (default 3)"),
  exclude_common: z
    .boolean()
    .optional()
    .describe("Exclude common parameter names like id, key, className (default false)"),
  summary_only: z
    .boolean()
    .optional()
    .describe("Return only summary without per-parameter details (default false)"),
};

/** Registers the get_prop_drilling tool for detecting parameter threading. */
export function registerPropDrillingTool(server: McpServer): void {
  server.registerTool(
    "get_prop_drilling",
    {
      description:
        "Detects parameter threading (prop drilling) by finding parameter names passed through chains of functions. Use limit/summary_only to control output.",
      inputSchema,
    },
    async (args) => {
      const pathValidation = await validatePath(args.path);
      if (!pathValidation.valid) {
        return createErrorResponse(pathValidation.error);
      }

      const { resolvedPath, isDirectory } = pathValidation;

      let filePaths = isDirectory
        ? await findFiles({
            cwd: resolvedPath,
            includeHidden: args.include_hidden,
            ignorePatterns: args.ignore_patterns,
            extensions: args.extensions,
            maxDepth: args.max_depth,
          })
        : [resolvedPath];

      if (args.max_files !== undefined && args.max_files > 0 && filePaths.length > args.max_files) {
        filePaths = filePaths.slice(0, args.max_files);
      }

      const fileAnalyses: FileParameterAnalysis[] = [];
      let totalParamsScanned = 0;

      for (const filePath of filePaths) {
        const fullPath = isDirectory ? join(resolvedPath, filePath) : filePath;
        const relativePath = isDirectory ? filePath : fullPath;
        const analysis = await analyzeFile(fullPath, relativePath);

        if (analysis) {
          fileAnalyses.push(analysis);
          totalParamsScanned += analysis.parameters.length;
        }
      }

      const minOccurrences = args.min_occurrences ?? DEFAULT_MIN_OCCURRENCES;
      let threaded = aggregateParameters(fileAnalyses, minOccurrences);

      if (args.exclude_common === true) {
        threaded = threaded.filter((p) => !COMMON_PARAMETER_NAMES.has(p.name));
      }

      // Summary uses the full list for accurate totals; limit only trims the returned details
      const totalFound = threaded.length;
      const highest =
        threaded.length > 0 ? { name: threaded[0].name, count: threaded[0].occurrences } : null;

      const limit = args.limit ?? DEFAULT_LIMIT;
      const limited = threaded.slice(0, limit);

      const result: PropDrillingResult = {
        path: resolvedPath,
        is_directory: isDirectory,
        threaded_parameters: args.summary_only === true ? [] : limited,
        summary: {
          files_analyzed: filePaths.length,
          total_parameters_scanned: totalParamsScanned,
          threaded_parameters_found: totalFound,
          highest_occurrence: highest,
        },
      };

      return createSuccessResponse(result, { itemCount: limited.length });
    }
  );
}

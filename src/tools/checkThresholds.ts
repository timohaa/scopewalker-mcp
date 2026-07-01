import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findFiles, DEFAULT_IGNORE_PATTERNS } from "../lib/glob.js";
import { analyze } from "../lib/tokei.js";
import { validatePath } from "../utils/paths.js";
import { createErrorResponse, createSuccessResponse } from "../utils/responses.js";
import {
  findOversizedFiles,
  findOversizedFunctions,
  sortAndLimitViolations,
  buildCheckThresholdsResult,
} from "./checkThresholdsHelpers.js";

const inputSchema = {
  path: z.string().describe("Target path"),
  max_file_lines: z.number().int().positive().optional().describe("File line threshold"),
  max_function_lines: z.number().int().positive().optional().describe("Function line threshold"),
  include_hidden: z.boolean().optional().describe("Include hidden"),
  ignore_patterns: z.array(z.string()).optional().describe("Exclude patterns"),
  extensions: z.array(z.string()).optional().describe("Filter by extensions"),
  max_depth: z.number().int().positive().optional().describe("Max depth"),
  max_files: z.number().int().positive().optional().describe("Max files to scan"),
  limit: z.number().int().positive().optional().describe("Max violations"),
};

const DEFAULT_MAX_FILE_LINES = 300;
const DEFAULT_MAX_FUNCTION_LINES = 100;
const DEFAULT_LIMIT = 20;

/** Registers the check_thresholds tool for finding oversized files and functions. */
export function registerCheckThresholdsTool(server: McpServer): void {
  server.registerTool(
    "check_thresholds",
    {
      description: "Finds files/functions exceeding size thresholds. Use limit to control output.",
      inputSchema,
    },
    async (args) => {
      const pathValidation = await validatePath(args.path);
      if (!pathValidation.valid) {
        return createErrorResponse(pathValidation.error);
      }

      const { resolvedPath, isDirectory } = pathValidation;
      const maxFileLines = args.max_file_lines ?? DEFAULT_MAX_FILE_LINES;
      const maxFunctionLines = args.max_function_lines ?? DEFAULT_MAX_FUNCTION_LINES;

      const extensions = args.extensions?.map((e) => (e.startsWith(".") ? e.slice(1) : e));
      const tokeiResult = await analyze(resolvedPath, {
        extensions,
        exclude: [...DEFAULT_IGNORE_PATTERNS, ...(args.ignore_patterns ?? [])],
        includeHidden: args.include_hidden,
      });

      if (!tokeiResult.success) {
        return createErrorResponse(tokeiResult.error);
      }

      const { oversizedFiles, fileLineCounts } = findOversizedFiles(
        tokeiResult.data,
        resolvedPath,
        maxFileLines
      );

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

      const { oversizedFunctions, totalFunctions } = await findOversizedFunctions(
        filePaths,
        resolvedPath,
        isDirectory,
        maxFunctionLines
      );

      const limit = args.limit ?? DEFAULT_LIMIT;
      const limitedFiles = sortAndLimitViolations(oversizedFiles, limit);
      const limitedFunctions = sortAndLimitViolations(oversizedFunctions, limit);

      const result = buildCheckThresholdsResult(
        { resolvedPath, maxFileLines, maxFunctionLines },
        {
          oversizedFiles: limitedFiles,
          oversizedFunctions: limitedFunctions,
          totalFileViolations: oversizedFiles.length,
          totalFunctionViolations: oversizedFunctions.length,
        },
        { filesChecked: fileLineCounts.size, totalFunctions }
      );

      const itemCount = limitedFiles.length + limitedFunctions.length;
      return createSuccessResponse(result, { itemCount });
    }
  );
}

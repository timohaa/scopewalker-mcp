import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findFiles } from "../lib/glob.js";
import type { FunctionCountsResult, FunctionLineCountsResult } from "../types/index.js";
import { validatePath } from "../utils/paths.js";
import { createErrorResponse, createSuccessResponse } from "../utils/responses.js";
import {
  calculateSummary as calculateLinesSummary,
  sortFiles as sortLineFiles,
} from "./functionLineCountsHelpers.js";
import {
  analyzeFilesForCounts,
  analyzeFilesForLines,
  sortCountFiles,
  calculateCountsSummary,
} from "./functionsHelpers.js";

const DEFAULT_LIMIT = 20;
const MAX_FUNCTIONS_PER_FILE = 100;

const inputSchema = {
  path: z.string().describe("Target path"),
  detail: z.enum(["counts", "lines"]).optional().describe("Detail level"),
  include_hidden: z.boolean().optional().describe("Include hidden"),
  ignore_patterns: z.array(z.string()).optional().describe("Exclude patterns"),
  extensions: z.array(z.string()).optional().describe("Filter by extensions"),
  max_depth: z.number().int().positive().optional().describe("Max depth"),
  max_files: z.number().int().positive().optional().describe("Max files to scan"),
  min_lines: z.number().int().positive().optional().describe("Min lines (lines mode)"),
  sort_by: z
    .enum(["count_desc", "count_asc", "lines_desc", "lines_asc", "name"])
    .optional()
    .describe("Sort order"),
  limit: z.number().int().positive().optional().describe("Max results"),
  grep: z.string().optional().describe("Filter by keyword"),
};

/** Registers the get_functions tool for function counts and line metrics. */
export function registerFunctionsTool(server: McpServer): void {
  server.registerTool(
    "get_functions",
    {
      description: "Returns function/method info. Use detail=lines for line counts per function.",
      inputSchema,
    },
    async (args) => {
      const pathValidation = await validatePath(args.path);
      if (!pathValidation.valid) {
        return createErrorResponse(pathValidation.error);
      }

      const { resolvedPath, isDirectory } = pathValidation;
      const detail = args.detail ?? "counts";

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

      if (detail === "lines") {
        return handleLinesMode(filePaths, resolvedPath, isDirectory, args);
      }
      return handleCountsMode(filePaths, resolvedPath, isDirectory, args);
    }
  );
}

/** Handles the counts detail mode: collects function counts per file and returns sorted results. */
async function handleCountsMode(
  filePaths: string[],
  resolvedPath: string,
  isDirectory: boolean,
  args: {
    grep?: string;
    sort_by?: "count_desc" | "count_asc" | "lines_desc" | "lines_asc" | "name";
    limit?: number;
  }
): Promise<ReturnType<typeof createSuccessResponse>> {
  let files = await analyzeFilesForCounts(filePaths, resolvedPath, isDirectory);

  if (args.grep !== undefined && args.grep !== "") {
    const pattern = args.grep.toLowerCase();
    files = files
      .map((file) => {
        if (file.path.toLowerCase().includes(pattern)) return file;
        const filteredFunctions = file.functions.filter((fn) =>
          fn.name.toLowerCase().includes(pattern)
        );
        return {
          ...file,
          functions: filteredFunctions,
          function_count: filteredFunctions.length,
        };
      })
      .filter((file) => file.path.toLowerCase().includes(pattern) || file.functions.length > 0);
  }

  const sortBy = args.sort_by ?? "count_desc";
  const sortedFiles = sortCountFiles(
    files,
    sortBy === "lines_desc" || sortBy === "lines_asc" ? "count_desc" : sortBy
  );
  const limit = args.limit ?? DEFAULT_LIMIT;
  const limitedFiles = sortedFiles.slice(0, limit);

  const cappedFiles = limitedFiles.map((file) => ({
    ...file,
    functions: file.functions.slice(0, MAX_FUNCTIONS_PER_FILE),
  }));

  const result: FunctionCountsResult = {
    path: resolvedPath,
    is_directory: isDirectory,
    files: cappedFiles,
    summary: calculateCountsSummary(sortedFiles),
  };

  return createSuccessResponse(result, { itemCount: cappedFiles.length });
}

/** Handles the lines detail mode: collects per-function line counts per file and returns sorted results. */
async function handleLinesMode(
  filePaths: string[],
  resolvedPath: string,
  isDirectory: boolean,
  args: {
    min_lines?: number;
    grep?: string;
    sort_by?: "count_desc" | "count_asc" | "lines_desc" | "lines_asc" | "name";
    limit?: number;
  }
): Promise<ReturnType<typeof createSuccessResponse>> {
  let files = await analyzeFilesForLines(filePaths, resolvedPath, isDirectory, args.min_lines);

  if (args.grep !== undefined && args.grep !== "") {
    const pattern = args.grep.toLowerCase();
    files = files
      .map((file) => {
        if (file.path.toLowerCase().includes(pattern)) {
          return file;
        }
        return {
          ...file,
          functions: file.functions.filter((fn) => fn.name.toLowerCase().includes(pattern)),
        };
      })
      .filter((file) => file.path.toLowerCase().includes(pattern) || file.functions.length > 0);
  }

  const sortBy = args.sort_by ?? "lines_desc";
  const linesSortBy = sortBy === "count_desc" || sortBy === "count_asc" ? "lines_desc" : sortBy;
  const sortedFiles = sortLineFiles(files, linesSortBy);
  const limit = args.limit ?? DEFAULT_LIMIT;
  const limitedFiles = sortedFiles.slice(0, limit);

  const cappedFiles = limitedFiles.map((file) => ({
    ...file,
    functions: file.functions.slice(0, MAX_FUNCTIONS_PER_FILE),
  }));

  const summary = calculateLinesSummary(sortedFiles);
  const result: FunctionLineCountsResult = {
    path: resolvedPath,
    is_directory: isDirectory,
    files: cappedFiles,
    summary,
  };

  const outputFunctionCount = cappedFiles.reduce((sum, f) => sum + f.functions.length, 0);
  return createSuccessResponse(result, { itemCount: outputFunctionCount });
}

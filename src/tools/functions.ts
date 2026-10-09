import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findFiles } from "../lib/glob.js";
import type { SourceScan } from "../lib/sourceFileWalker.js";
import type { FunctionCountsResult, FunctionLineCountsResult } from "../types/index.js";
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
} from "../utils/schemaLimits.js";
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
  path: pathSchema,
  detail: z
    .enum(["counts", "lines"])
    .optional()
    .describe("counts: functions per file; lines: lines per function (default counts)"),
  include_hidden: includeHiddenSchema,
  ignore_patterns: ignorePatternsSchema,
  extensions: extensionsSchema,
  max_depth: maxDepthSchema,
  max_files: maxFilesSchema,
  min_lines: boundedInt(10_000).describe(
    "Lines mode only: skip functions shorter than this many lines"
  ),
  sort_by: z
    .enum(["count_desc", "count_asc", "lines_desc", "lines_asc", "name"])
    .optional()
    .describe("Sort order (default count_desc for counts, lines_desc for lines)"),
  limit: limitSchema.describe("Max files returned (default 20)"),
  grep: z
    .string()
    .optional()
    .describe("Keep files or functions whose path or name contains this text (case-insensitive)"),
};

/** Registers the get_functions tool for function counts and line metrics. */
export function registerFunctionsTool(server: McpServer): void {
  server.registerTool(
    "get_functions",
    {
      title: "Functions",
      description: "Returns function/method info. Use detail=lines for line counts per function.",
      inputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
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

      const scan = { filePaths, basePath: resolvedPath, isDirectory, maxFiles: args.max_files };
      if (detail === "lines") {
        return handleLinesMode(scan, args);
      }
      return handleCountsMode(scan, args);
    }
  );
}

/** Handles the counts detail mode: collects function counts per file and returns sorted results. */
async function handleCountsMode(
  scan: SourceScan,
  args: {
    grep?: string | undefined;
    sort_by?: "count_desc" | "count_asc" | "lines_desc" | "lines_asc" | "name" | undefined;
    limit?: number | undefined;
  }
): Promise<ReturnType<typeof createSuccessResponse>> {
  let files = await analyzeFilesForCounts(scan);

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
    path: scan.basePath,
    is_directory: scan.isDirectory,
    files: cappedFiles,
    summary: calculateCountsSummary(sortedFiles),
  };

  return createSuccessResponse(result, { itemCount: cappedFiles.length });
}

/** Handles the lines detail mode: collects per-function line counts per file and returns sorted results. */
async function handleLinesMode(
  scan: SourceScan,
  args: {
    min_lines?: number | undefined;
    grep?: string | undefined;
    sort_by?: "count_desc" | "count_asc" | "lines_desc" | "lines_asc" | "name" | undefined;
    limit?: number | undefined;
  }
): Promise<ReturnType<typeof createSuccessResponse>> {
  let files = await analyzeFilesForLines(scan, args.min_lines);

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
    path: scan.basePath,
    is_directory: scan.isDirectory,
    files: cappedFiles,
    summary,
  };

  const outputFunctionCount = cappedFiles.reduce((sum, f) => sum + f.functions.length, 0);
  return createSuccessResponse(result, { itemCount: outputFunctionCount });
}

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findFiles } from "../lib/glob.js";
import { detectLanguage, getComments, getFunctions } from "../lib/treeSitter.js";
import type {
  FileFunctionLineCount,
  FunctionLineInfo,
  FunctionLineCountsResult,
} from "../types/index.js";
import { isFileWithinSizeLimit } from "../utils/fileGuards.js";
import { validatePath } from "../utils/paths.js";
import { createErrorResponse, createSuccessResponse } from "../utils/responses.js";
import {
  calculateFunctionLineStats,
  calculateSummary,
  sortFiles,
} from "./functionLineCountsHelpers.js";

const DEFAULT_LIMIT = 20;

/** Maximum number of functions to include per file to prevent huge responses. */
const MAX_FUNCTIONS_PER_FILE = 100;

const inputSchema = {
  path: z.string().describe("Target path"),
  include_hidden: z.boolean().optional().describe("Include hidden (default: false)"),
  ignore_patterns: z.array(z.string()).optional().describe("Exclude patterns"),
  extensions: z.array(z.string()).optional().describe("Filter by extensions"),
  max_depth: z.number().int().positive().optional().describe("Max depth"),
  max_files: z.number().int().positive().optional().describe("Max files to scan"),
  min_lines: z.number().int().positive().optional().describe("Min function lines"),
  sort_by: z.enum(["lines_desc", "lines_asc", "name"]).optional().describe("Sort order"),
  limit: z.number().int().positive().optional().describe("Max results (default: 20)"),
  grep: z.string().optional().describe("Filter by keyword"),
};

/** Registers the get_function_line_counts tool for per-function line metrics. */
export function registerFunctionLineCountsTool(server: McpServer): void {
  server.registerTool(
    "get_function_line_counts",
    {
      description: "Returns line counts per function. Use min_lines/extensions to filter.",
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

      let files = await analyzeFiles(filePaths, resolvedPath, isDirectory, args.min_lines);

      // Apply grep filter if provided
      if (args.grep !== undefined && args.grep !== "") {
        const pattern = args.grep.toLowerCase();
        files = files
          .map((file) => {
            // If file path matches, include all functions
            if (file.path.toLowerCase().includes(pattern)) {
              return file;
            }
            // Otherwise filter functions by name
            return {
              ...file,
              functions: file.functions.filter((fn) => fn.name.toLowerCase().includes(pattern)),
            };
          })
          .filter((file) => file.path.toLowerCase().includes(pattern) || file.functions.length > 0);
      }

      const sortedFiles = sortFiles(files, args.sort_by ?? "lines_desc");
      const limit = args.limit ?? DEFAULT_LIMIT;
      const limitedFiles = sortedFiles.slice(0, limit);

      // Cap functions per file to prevent huge responses
      const cappedFiles = limitedFiles.map((file) => ({
        ...file,
        functions: file.functions.slice(0, MAX_FUNCTIONS_PER_FILE),
      }));

      const summary = calculateSummary(sortedFiles); // Summary uses full list for accurate totals
      const result: FunctionLineCountsResult = {
        path: resolvedPath,
        is_directory: isDirectory,
        files: cappedFiles,
        summary,
      };

      const outputFunctionCount = cappedFiles.reduce((sum, f) => sum + f.functions.length, 0);
      return createSuccessResponse(result, { itemCount: outputFunctionCount });
    }
  );
}

/** Analyzes a single file and returns function line counts, or null if no functions found. */
async function analyzeFile(
  fullPath: string,
  relativePath: string,
  minLines?: number
): Promise<FileFunctionLineCount | null> {
  const language = detectLanguage(fullPath);
  if (!language) return null;

  const withinLimit = await isFileWithinSizeLimit(fullPath);
  if (!withinLimit) return null;

  const code = await readFile(fullPath, "utf-8");
  const lines = code.split("\n");
  const [functionLocations, comments] = await Promise.all([
    getFunctions(code, language),
    getComments(code, language),
  ]);

  const functions: FunctionLineInfo[] = [];
  for (const fn of functionLocations) {
    const totalLines = fn.endLine - fn.startLine + 1;
    if (minLines !== undefined && minLines > 0 && totalLines < minLines) continue;

    functions.push({
      name: fn.name,
      start_line: fn.startLine,
      end_line: fn.endLine,
      lines: calculateFunctionLineStats(lines, fn, comments),
    });
  }

  return functions.length > 0 ? { path: relativePath, language, functions } : null;
}

/** Parses files and calculates line counts for each function. */
async function analyzeFiles(
  filePaths: string[],
  basePath: string,
  isDirectory: boolean,
  minLines?: number
): Promise<FileFunctionLineCount[]> {
  const results: FileFunctionLineCount[] = [];

  for (const filePath of filePaths) {
    const fullPath = isDirectory ? join(basePath, filePath) : filePath;
    const relativePath = isDirectory ? filePath : fullPath;

    try {
      const result = await analyzeFile(fullPath, relativePath, minLines);
      if (result) results.push(result);
    } catch (err) {
      console.error(`Failed to read ${fullPath}:`, err);
    }
  }

  return results;
}

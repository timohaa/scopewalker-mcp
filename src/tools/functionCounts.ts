import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findFiles } from "../lib/glob.js";
import { detectLanguage, getFunctions } from "../lib/treeSitter.js";
import type { FileFunctionCount, FunctionCountsResult, FunctionInfo } from "../types/index.js";
import { isFileWithinSizeLimit } from "../utils/fileGuards.js";
import { validatePath } from "../utils/paths.js";
import { createErrorResponse, createSuccessResponse } from "../utils/responses.js";

const DEFAULT_LIMIT = 20;

/** Maximum number of function names to include per file to prevent huge responses. */
const MAX_FUNCTIONS_PER_FILE = 100;

const inputSchema = {
  path: z.string().describe("Target path"),
  include_hidden: z.boolean().optional().describe("Include hidden (default: false)"),
  ignore_patterns: z.array(z.string()).optional().describe("Exclude patterns"),
  extensions: z.array(z.string()).optional().describe("Filter by extensions"),
  max_depth: z.number().int().positive().optional().describe("Max depth"),
  max_files: z.number().int().positive().optional().describe("Max files to scan"),
  sort_by: z.enum(["count_desc", "count_asc", "name"]).optional().describe("Sort order"),
  limit: z.number().int().positive().optional().describe("Max results (default: 20)"),
  grep: z.string().optional().describe("Filter by keyword"),
};

/** Registers the get_function_counts tool for counting functions per file. */
export function registerFunctionCountsTool(server: McpServer): void {
  server.registerTool(
    "get_function_counts",
    {
      description: "Returns function/method counts per file. Use extensions to filter.",
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

      let files = await analyzeFiles(filePaths, resolvedPath, isDirectory);

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

      const sortedFiles = sortFiles(files, args.sort_by ?? "count_desc");
      const limit = args.limit ?? DEFAULT_LIMIT;
      const limitedFiles = sortedFiles.slice(0, limit);

      // Cap functions per file to prevent huge responses
      const cappedFiles = limitedFiles.map((file) => ({
        ...file,
        functions: file.functions.slice(0, MAX_FUNCTIONS_PER_FILE),
      }));

      const result: FunctionCountsResult = {
        path: resolvedPath,
        is_directory: isDirectory,
        files: cappedFiles,
        summary: calculateSummary(sortedFiles), // Summary uses full list for accurate totals
      };

      return createSuccessResponse(result, { itemCount: cappedFiles.length });
    }
  );
}

/** Parses files and counts functions in each. */
async function analyzeFiles(
  filePaths: string[],
  basePath: string,
  isDirectory: boolean
): Promise<FileFunctionCount[]> {
  const results: FileFunctionCount[] = [];

  for (const filePath of filePaths) {
    const fullPath = isDirectory ? join(basePath, filePath) : filePath;
    const relativePath = isDirectory ? filePath : fullPath;
    const language = detectLanguage(fullPath);

    // Skip files with unsupported languages to avoid response bloat from non-code files
    if (!language) continue;

    try {
      const withinLimit = await isFileWithinSizeLimit(fullPath);
      if (!withinLimit) continue;

      const code = await readFile(fullPath, "utf-8");
      const functionLocations = await getFunctions(code, language);

      const functions: FunctionInfo[] = functionLocations.map((fn) => ({
        name: fn.name,
        line: fn.startLine,
      }));

      results.push({
        path: relativePath,
        language,
        function_count: functions.length,
        functions,
      });
    } catch (err) {
      // File read error - skip silently
      console.error(`Failed to read ${fullPath}:`, err);
    }
  }

  return results;
}

/** Sorts file results by function count or name. */
function sortFiles(
  files: FileFunctionCount[],
  sortBy: "count_desc" | "count_asc" | "name"
): FileFunctionCount[] {
  const sorted = [...files];

  switch (sortBy) {
    case "count_desc":
      sorted.sort((a, b) => b.function_count - a.function_count);
      break;
    case "count_asc":
      sorted.sort((a, b) => a.function_count - b.function_count);
      break;
    case "name":
      sorted.sort((a, b) => a.path.localeCompare(b.path));
      break;
  }

  return sorted;
}

/** Aggregates function count statistics across all files. */
function calculateSummary(files: FileFunctionCount[]): FunctionCountsResult["summary"] {
  let totalFunctions = 0;
  let filesWithNoFunctions = 0;

  for (const file of files) {
    totalFunctions += file.function_count;
    if (file.function_count === 0) {
      filesWithNoFunctions++;
    }
  }

  return {
    total_files_analyzed: files.length,
    total_functions: totalFunctions,
    files_with_no_functions: filesWithNoFunctions,
  };
}

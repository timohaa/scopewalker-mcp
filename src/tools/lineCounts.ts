import { relative } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DEFAULT_IGNORE_PATTERNS } from "../lib/glob.js";
import { analyze } from "../lib/tokei.js";
import type { FileLineCount, LineCountsResult } from "../types/index.js";
import { validatePath } from "../utils/paths.js";
import { createErrorResponse, createSuccessResponse } from "../utils/responses.js";

const DEFAULT_LIMIT = 20;

const inputSchema = {
  path: z.string().describe("Target path"),
  include_hidden: z.boolean().optional().describe("Include hidden"),
  ignore_patterns: z.array(z.string()).optional().describe("Exclude patterns"),
  extensions: z.array(z.string()).optional().describe("Filter by extensions"),
  sort_by: z.enum(["lines_desc", "lines_asc", "name"]).optional().describe("Sort order"),
  limit: z.number().int().positive().optional().describe("Max results"),
  grep: z.string().optional().describe("Filter by keyword"),
};

/** Registers the get_line_counts tool for analyzing file line metrics via tokei. */
export function registerLineCountsTool(server: McpServer): void {
  server.registerTool(
    "get_line_counts",
    {
      description: "Returns file line counts (code/blank/comment). Use extensions to filter.",
      inputSchema,
    },
    async (args) => {
      const pathValidation = await validatePath(args.path);
      if (!pathValidation.valid) {
        return createErrorResponse(pathValidation.error);
      }

      const { resolvedPath, isDirectory } = pathValidation;

      // Normalize extensions (remove dots if present)
      const extensions = args.extensions?.map((e) => (e.startsWith(".") ? e.slice(1) : e));

      const tokeiResult = await analyze(resolvedPath, {
        extensions,
        exclude: [...DEFAULT_IGNORE_PATTERNS, ...(args.ignore_patterns ?? [])],
      });

      if (!tokeiResult.success) {
        return createErrorResponse(tokeiResult.error);
      }

      let files = transformTokeiOutput(tokeiResult.data, resolvedPath);

      // Apply grep filter if provided
      if (args.grep !== undefined && args.grep !== "") {
        const pattern = args.grep.toLowerCase();
        files = files.filter((file) => file.path.toLowerCase().includes(pattern));
      }

      const sortedFiles = sortFiles(files, args.sort_by ?? "lines_desc");
      const limit = args.limit ?? DEFAULT_LIMIT;
      const limitedFiles = sortedFiles.slice(0, limit);

      const result: LineCountsResult = {
        path: resolvedPath,
        is_directory: isDirectory,
        files: limitedFiles,
        summary: calculateSummary(sortedFiles), // Summary uses full list for accurate totals
      };

      return createSuccessResponse(result, { itemCount: limitedFiles.length });
    }
  );
}

/**
 * Transforms tokei output (grouped by language) to flat file list.
 */
function transformTokeiOutput(
  tokeiOutput: Record<
    string,
    { reports: { name: string; stats: { blanks: number; code: number; comments: number } }[] }
  >,
  basePath: string
): FileLineCount[] {
  const files: FileLineCount[] = [];

  for (const languageStats of Object.values(tokeiOutput)) {
    for (const report of languageStats.reports) {
      const relativePath = relative(basePath, report.name) || report.name;
      const { blanks, code, comments } = report.stats;

      files.push({
        path: relativePath,
        lines: {
          total: blanks + code + comments,
          code,
          blank: blanks,
          comment: comments,
        },
      });
    }
  }

  return files;
}

/** Sorts file results by line count or name. */
function sortFiles(
  files: FileLineCount[],
  sortBy: "lines_desc" | "lines_asc" | "name"
): FileLineCount[] {
  const sorted = [...files];

  switch (sortBy) {
    case "lines_desc":
      sorted.sort((a, b) => b.lines.total - a.lines.total);
      break;
    case "lines_asc":
      sorted.sort((a, b) => a.lines.total - b.lines.total);
      break;
    case "name":
      sorted.sort((a, b) => a.path.localeCompare(b.path));
      break;
  }

  return sorted;
}

/** Aggregates line count statistics across all files. */
function calculateSummary(files: FileLineCount[]): LineCountsResult["summary"] {
  let totalLines = 0;
  let totalCodeLines = 0;
  let totalBlankLines = 0;
  let totalCommentLines = 0;

  for (const file of files) {
    totalLines += file.lines.total;
    totalCodeLines += file.lines.code;
    totalBlankLines += file.lines.blank;
    totalCommentLines += file.lines.comment;
  }

  return {
    total_files: files.length,
    total_lines: totalLines,
    total_code_lines: totalCodeLines,
    total_blank_lines: totalBlankLines,
    total_comment_lines: totalCommentLines,
  };
}

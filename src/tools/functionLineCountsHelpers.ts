import type { CommentInfo, FunctionLocation } from "../lib/treeSitter.js";
import type { FileFunctionLineCount, FunctionLineCountsResult, LineStats } from "../types/index.js";

/**
 * Calculates line statistics for a function using AST-based comment detection.
 * Uses tree-sitter parsed comments for accurate counting instead of heuristics.
 */
export function calculateFunctionLineStats(
  allLines: string[],
  fn: FunctionLocation,
  comments: CommentInfo[]
): LineStats {
  const functionLines = allLines.slice(fn.startLine - 1, fn.endLine);
  let blank = 0;

  for (const line of functionLines) {
    if (line.trim() === "") {
      blank++;
    }
  }

  // Use AST-parsed comments to accurately count multi-line comment blocks within the function
  const commentLinesInFunction = new Set<number>();
  for (const comment of comments) {
    if (comment.endLine >= fn.startLine && comment.startLine <= fn.endLine) {
      const start = Math.max(comment.startLine, fn.startLine);
      const end = Math.min(comment.endLine, fn.endLine);
      for (let line = start; line <= end; line++) {
        commentLinesInFunction.add(line);
      }
    }
  }

  const total = functionLines.length;
  const comment = commentLinesInFunction.size;
  const code = total - blank - comment;

  return { total, code, blank, comment };
}

/** Sorts files and their functions by line count or name. */
export function sortFiles(
  files: FileFunctionLineCount[],
  sortBy: "lines_desc" | "lines_asc" | "name"
): FileFunctionLineCount[] {
  for (const file of files) {
    switch (sortBy) {
      case "lines_desc":
        file.functions.sort((a, b) => b.lines.total - a.lines.total);
        break;
      case "lines_asc":
        file.functions.sort((a, b) => a.lines.total - b.lines.total);
        break;
      case "name":
        file.functions.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
  }

  const sorted = [...files];
  switch (sortBy) {
    case "lines_desc":
      sorted.sort((a, b) => {
        const maxA = Math.max(...a.functions.map((f) => f.lines.total), 0);
        const maxB = Math.max(...b.functions.map((f) => f.lines.total), 0);
        return maxB - maxA;
      });
      break;
    case "lines_asc":
      sorted.sort((a, b) => {
        const maxA = Math.max(...a.functions.map((f) => f.lines.total), 0);
        const maxB = Math.max(...b.functions.map((f) => f.lines.total), 0);
        return maxA - maxB;
      });
      break;
    case "name":
      sorted.sort((a, b) => a.path.localeCompare(b.path));
      break;
  }

  return sorted;
}

/** Aggregates function line statistics across all files. */
export function calculateSummary(
  files: FileFunctionLineCount[]
): FunctionLineCountsResult["summary"] {
  let totalFunctions = 0;
  let totalLines = 0;
  let functionsOver50 = 0;
  let largestFunction: { name: string; file: string; lines: number } | null = null;

  for (const file of files) {
    for (const fn of file.functions) {
      totalFunctions++;
      totalLines += fn.lines.total;

      if (fn.lines.total > 50) {
        functionsOver50++;
      }

      if (!largestFunction || fn.lines.total > largestFunction.lines) {
        largestFunction = {
          name: fn.name,
          file: file.path,
          lines: fn.lines.total,
        };
      }
    }
  }

  return {
    total_functions: totalFunctions,
    average_lines_per_function: totalFunctions > 0 ? Math.round(totalLines / totalFunctions) : 0,
    largest_function: largestFunction,
    functions_over_50_lines: functionsOver50,
  };
}

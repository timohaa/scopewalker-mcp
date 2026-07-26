import type { CommentInfo, FunctionLocation } from "../lib/treeSitter.js";
import type { FileFunctionLineCount, FunctionLineCountsResult, LineStats } from "../types/index.js";

/**
 * Calculates line statistics for a function using AST-based comment detection.
 * Each line is assigned to exactly one category, so code + blank + comment
 * always equals total:
 * - comment: every non-whitespace character lies inside a comment (a line with
 *   code and a trailing comment counts as code); blank lines spanned by a
 *   multi-line comment also count as comment
 * - blank: whitespace-only lines outside comments
 * - code: everything else
 */
export function calculateFunctionLineStats(
  allLines: string[],
  fn: FunctionLocation,
  comments: CommentInfo[]
): LineStats {
  const functionLines = allLines.slice(fn.startLine - 1, fn.endLine);
  const commentSpansByLine = collectCommentSpans(fn, comments);

  let blank = 0;
  let comment = 0;
  let code = 0;

  for (const [index, line] of functionLines.entries()) {
    const spans = commentSpansByLine.get(fn.startLine + index);
    if (line.trim() === "") {
      if (spans) {
        comment++;
      } else {
        blank++;
      }
    } else if (spans && isFullyCommented(line, spans)) {
      comment++;
    } else {
      code++;
    }
  }

  return { total: functionLines.length, code, blank, comment };
}

/** Maps each function line to the [start, end) column ranges covered by comments. */
function collectCommentSpans(
  fn: FunctionLocation,
  comments: CommentInfo[]
): Map<number, [number, number][]> {
  const spansByLine = new Map<number, [number, number][]>();

  for (const comment of comments) {
    if (comment.endLine < fn.startLine || comment.startLine > fn.endLine) continue;

    const first = Math.max(comment.startLine, fn.startLine);
    const last = Math.min(comment.endLine, fn.endLine);
    for (let line = first; line <= last; line++) {
      const start = line === comment.startLine ? comment.startColumn : 0;
      const end = line === comment.endLine ? comment.endColumn : Number.POSITIVE_INFINITY;
      const spans = spansByLine.get(line) ?? [];
      spans.push([start, end]);
      spansByLine.set(line, spans);
    }
  }

  return spansByLine;
}

/** Checks whether every non-whitespace character of a line falls inside a comment span. */
function isFullyCommented(line: string, spans: [number, number][]): boolean {
  for (let col = 0; col < line.length; col++) {
    if (/\s/.test(line[col])) continue;
    const covered = spans.some(([start, end]) => col >= start && col < end);
    if (!covered) return false;
  }
  return true;
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

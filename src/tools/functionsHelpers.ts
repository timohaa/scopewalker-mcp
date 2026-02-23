import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { detectLanguage, getComments, getFunctions } from "../lib/treeSitter.js";
import type {
  FileFunctionCount,
  FileFunctionLineCount,
  FunctionCountsResult,
  FunctionInfo,
  FunctionLineInfo,
} from "../types/index.js";
import { isFileWithinSizeLimit } from "../utils/fileGuards.js";
import { calculateFunctionLineStats } from "./functionLineCountsHelpers.js";

/** Parses each file path and extracts function names and counts. */
export async function analyzeFilesForCounts(
  filePaths: string[],
  basePath: string,
  isDirectory: boolean
): Promise<FileFunctionCount[]> {
  const results: FileFunctionCount[] = [];

  for (const filePath of filePaths) {
    const fullPath = isDirectory ? join(basePath, filePath) : filePath;
    const relativePath = isDirectory ? filePath : fullPath;
    const language = detectLanguage(fullPath);

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
      console.error(`Failed to read ${fullPath}:`, err);
    }
  }

  return results;
}

/** Parses each file path and extracts per-function line stats, optionally filtered by minLines. */
export async function analyzeFilesForLines(
  filePaths: string[],
  basePath: string,
  isDirectory: boolean,
  minLines?: number
): Promise<FileFunctionLineCount[]> {
  const results: FileFunctionLineCount[] = [];

  for (const filePath of filePaths) {
    const fullPath = isDirectory ? join(basePath, filePath) : filePath;
    const relativePath = isDirectory ? filePath : fullPath;
    const language = detectLanguage(fullPath);

    if (!language) continue;

    try {
      const withinLimit = await isFileWithinSizeLimit(fullPath);
      if (!withinLimit) continue;

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

      if (functions.length > 0) {
        results.push({ path: relativePath, language, functions });
      }
    } catch (err) {
      console.error(`Failed to read ${fullPath}:`, err);
    }
  }

  return results;
}

/** Sorts an array of FileFunctionCount entries by the given sort key. */
export function sortCountFiles(
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

/** Computes aggregate summary stats (total functions, files with no functions) across all files. */
export function calculateCountsSummary(
  files: FileFunctionCount[]
): FunctionCountsResult["summary"] {
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

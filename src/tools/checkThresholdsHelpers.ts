import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { TokeiOutput } from "../lib/tokei.js";
import { detectLanguage, getFunctions } from "../lib/treeSitter.js";
import type { CheckThresholdsResult, OversizedFile, OversizedFunction } from "../types/index.js";
import { isFileWithinSizeLimit } from "../utils/fileGuards.js";

/** Configuration for threshold checking. */
export interface ThresholdConfig {
  resolvedPath: string;
  maxFileLines: number;
  maxFunctionLines: number;
}

/** Violation data from threshold analysis. */
export interface ViolationData {
  oversizedFiles: OversizedFile[];
  oversizedFunctions: OversizedFunction[];
  totalFileViolations: number;
  totalFunctionViolations: number;
}

/** Summary statistics from threshold analysis. */
export interface SummaryStats {
  filesChecked: number;
  totalFunctions: number;
}

/** Extracts oversized files from tokei analysis results. */
export function findOversizedFiles(
  tokeiData: TokeiOutput,
  basePath: string,
  maxFileLines: number
): { oversizedFiles: OversizedFile[]; fileLineCounts: Map<string, number> } {
  const oversizedFiles: OversizedFile[] = [];
  const fileLineCounts = new Map<string, number>();

  for (const languageStats of Object.values(tokeiData)) {
    for (const report of languageStats.reports) {
      const totalLines = report.stats.blanks + report.stats.code + report.stats.comments;
      const relativePath = relative(basePath, report.name) || report.name;
      fileLineCounts.set(report.name, totalLines);

      if (totalLines > maxFileLines) {
        oversizedFiles.push({
          path: relativePath,
          lines: totalLines,
          exceeds_by: totalLines - maxFileLines,
        });
      }
    }
  }

  return { oversizedFiles, fileLineCounts };
}

/** Scans files for functions exceeding the line limit. */
export async function findOversizedFunctions(
  filePaths: string[],
  basePath: string,
  isDirectory: boolean,
  maxLines: number
): Promise<{ oversizedFunctions: OversizedFunction[]; totalFunctions: number }> {
  const oversizedFunctions: OversizedFunction[] = [];
  let totalFunctions = 0;

  for (const filePath of filePaths) {
    const fullPath = isDirectory ? join(basePath, filePath) : filePath;
    const relativePath = isDirectory ? filePath : fullPath;
    const language = detectLanguage(fullPath);

    if (!language) continue;

    try {
      const withinLimit = await isFileWithinSizeLimit(fullPath);
      if (!withinLimit) continue;

      const code = await readFile(fullPath, "utf-8");
      const functions = await getFunctions(code, language);
      totalFunctions += functions.length;

      for (const fn of functions) {
        const lines = fn.endLine - fn.startLine + 1;
        if (lines > maxLines) {
          oversizedFunctions.push({
            path: relativePath,
            function_name: fn.name,
            lines,
            exceeds_by: lines - maxLines,
            start_line: fn.startLine,
          });
        }
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return { oversizedFunctions, totalFunctions };
}

/** Sorts violations by severity and applies optional limit. */
export function sortAndLimitViolations<T extends { lines: number }>(
  violations: T[],
  limit?: number
): T[] {
  const sorted = violations.sort((a, b) => b.lines - a.lines);
  return limit !== undefined ? sorted.slice(0, limit) : sorted;
}

/** Constructs the final check_thresholds result object. */
export function buildCheckThresholdsResult(
  config: ThresholdConfig,
  violations: ViolationData,
  stats: SummaryStats
): CheckThresholdsResult {
  return {
    path: config.resolvedPath,
    thresholds: {
      max_file_lines: config.maxFileLines,
      max_function_lines: config.maxFunctionLines,
    },
    violations: {
      oversized_files: violations.oversizedFiles,
      oversized_functions: violations.oversizedFunctions,
    },
    summary: {
      files_checked: stats.filesChecked,
      functions_checked: stats.totalFunctions,
      file_violations: violations.totalFileViolations,
      function_violations: violations.totalFunctionViolations,
    },
  };
}

import type { LineStats } from "./lineCounts.js";

export interface FunctionInfo {
  name: string;
  line: number;
}

export interface FileFunctionCount {
  path: string;
  language: string;
  function_count: number;
  functions: FunctionInfo[];
}

export interface FunctionCountsResult {
  path: string;
  is_directory: boolean;
  files: FileFunctionCount[];
  summary: {
    total_files_analyzed: number;
    total_functions: number;
    files_with_no_functions: number;
  };
}

export interface FunctionLineInfo {
  name: string;
  start_line: number;
  end_line: number;
  lines: LineStats;
}

export interface FileFunctionLineCount {
  path: string;
  language: string;
  functions: FunctionLineInfo[];
}

export interface FunctionLineCountsResult {
  path: string;
  is_directory: boolean;
  files: FileFunctionLineCount[];
  summary: {
    total_functions: number;
    average_lines_per_function: number;
    largest_function: {
      name: string;
      file: string;
      lines: number;
    } | null;
    functions_over_50_lines: number;
  };
}

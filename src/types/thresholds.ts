export interface OversizedFile {
  path: string;
  lines: number;
  exceeds_by: number;
}

export interface OversizedFunction {
  path: string;
  function_name: string;
  lines: number;
  exceeds_by: number;
  start_line: number;
}

export interface CheckThresholdsResult {
  path: string;
  thresholds: {
    max_file_lines: number;
    max_function_lines: number;
  };
  violations: {
    oversized_files: OversizedFile[];
    oversized_functions: OversizedFunction[];
  };
  summary: {
    files_checked: number;
    functions_checked: number;
    file_violations: number;
    function_violations: number;
    /** Files the function pass could not analyze (e.g. over the 1MB AST size guard). */
    files_skipped: number;
    /** False when files_skipped is nonzero, so oversized_functions may be incomplete. */
    scan_complete: boolean;
  };
}

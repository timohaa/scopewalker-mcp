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
  };
}

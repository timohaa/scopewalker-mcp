export interface ComplexityHotspot {
  function: string;
  line: number;
  issue: string;
  value: number;
  recommendation: string;
}

/** Radon's cyclomatic bands: "high" above 10, "extreme" above 30. */
export type ComplexitySeverity = "high" | "extreme";

export interface FunctionComplexity {
  name: string;
  line: number;
  cyclomatic_complexity: number;
  cognitive_complexity: number;
  nesting_depth: number;
  severity: ComplexitySeverity;
}

export interface FileComplexity {
  path: string;
  metrics: {
    max_nesting_depth: number;
    avg_nesting_depth: number;
    max_parameters: number;
    avg_parameters: number;
    dependency_count: number;
    /** Whole-file sum. See max_cognitive_complexity for the worst single function. */
    cognitive_complexity: number;
    function_count: number;
    max_cyclomatic_complexity: number;
    avg_cyclomatic_complexity: number;
    max_cognitive_complexity: number;
  };
  /** Functions over the cyclomatic threshold, worst first, capped per file. */
  functions: FunctionComplexity[];
  hotspots: ComplexityHotspot[];
}

export interface ComplexityMetricsResult {
  path: string;
  files: FileComplexity[];
  summary: {
    files_analyzed: number;
    high_complexity_files: number;
    high_complexity_functions: number;
    total_hotspots: number;
    most_complex_file: {
      path: string;
      cognitive_complexity: number;
    } | null;
    most_complex_function: {
      path: string;
      function: string;
      line: number;
      cyclomatic_complexity: number;
    } | null;
  };
}

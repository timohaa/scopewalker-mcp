export interface ComplexityHotspot {
  function: string;
  line: number;
  issue: string;
  value: number;
  recommendation: string;
}

export interface FileComplexity {
  path: string;
  metrics: {
    max_nesting_depth: number;
    avg_nesting_depth: number;
    max_parameters: number;
    avg_parameters: number;
    dependency_count: number;
    cognitive_complexity: number;
  };
  hotspots: ComplexityHotspot[];
}

export interface ComplexityMetricsResult {
  path: string;
  files: FileComplexity[];
  summary: {
    files_analyzed: number;
    high_complexity_files: number;
    total_hotspots: number;
    most_complex_file: {
      path: string;
      cognitive_complexity: number;
    } | null;
  };
}

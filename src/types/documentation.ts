export interface UndocumentedItem {
  path: string;
  name: string;
  type: "function" | "class" | "method";
  line: number;
  lines?: number;
  methods_undocumented?: string[];
}

export interface FileDocumentation {
  path: string;
  documented: number;
  undocumented: number;
  percentage: number;
}

export interface DocumentationCoverageResult {
  path: string;
  coverage: {
    documented: number;
    undocumented: number;
    percentage: number;
  };
  undocumented_items: UndocumentedItem[];
  by_file: FileDocumentation[];
  summary: {
    files_analyzed: number;
    total_symbols: number;
    fully_documented_files: number;
    zero_documentation_files: number;
  };
  /** Present when results were truncated due to limit parameter */
  truncated?: {
    items: number;
    total: number;
  };
}

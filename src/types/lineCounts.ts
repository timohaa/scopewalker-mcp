export interface LineStats {
  total: number;
  code: number;
  blank: number;
  comment: number;
}

export interface FileLineCount {
  path: string;
  lines: LineStats;
}

export interface LineCountsResult {
  path: string;
  is_directory: boolean;
  files: FileLineCount[];
  summary: {
    total_files: number;
    total_lines: number;
    total_code_lines: number;
    total_blank_lines: number;
    total_comment_lines: number;
  };
}

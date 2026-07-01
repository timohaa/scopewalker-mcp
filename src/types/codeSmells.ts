export interface CodeSmell {
  path: string;
  line: number;
  type: CodeSmellType;
  text: string;
}

export type CodeSmellType =
  "todo" | "fixme" | "hack" | "xxx" | "bug" | "unused" | "deprecated" | "unsafe_cast";

export interface FileSmells {
  path: string;
  smells: CodeSmell[];
}

export interface CodeSmellsResult {
  path: string;
  is_directory: boolean;
  files: FileSmells[];
  summary: {
    total_files_scanned: number;
    files_with_smells: number;
    total_smells: number;
    by_type: Record<CodeSmellType, number>;
  };
}

export interface ParameterInfo {
  name: string;
  functionName: string;
  line: number;
  isForwarded: boolean;
}

export interface FileParameterAnalysis {
  path: string;
  language: string;
  parameters: ParameterInfo[];
}

export type RiskLevel = "high" | "medium" | "low";

export interface ThreadedParameter {
  name: string;
  occurrences: number;
  files: string[];
  functions: string[];
  forwarding_evidence: number;
  risk: RiskLevel;
}

export interface PropDrillingSummary {
  files_analyzed: number;
  total_parameters_scanned: number;
  threaded_parameters_found: number;
  highest_occurrence: { name: string; count: number } | null;
}

export interface PropDrillingResult {
  path: string;
  is_directory: boolean;
  threaded_parameters: ThreadedParameter[];
  summary: PropDrillingSummary;
}

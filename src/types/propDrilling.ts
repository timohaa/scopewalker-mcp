import { z } from "zod";

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

export const riskLevelSchema = z.enum(["high", "medium", "low"]);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

export const threadedParameterSchema = z.object({
  name: z.string(),
  occurrences: z.number(),
  files: z.array(z.string()),
  functions: z.array(z.string()),
  forwarding_evidence: z.number(),
  risk: riskLevelSchema,
});
export type ThreadedParameter = z.infer<typeof threadedParameterSchema>;

export const propDrillingSummarySchema = z.object({
  files_analyzed: z.number(),
  total_parameters_scanned: z.number(),
  threaded_parameters_found: z.number(),
  highest_occurrence: z.object({ name: z.string(), count: z.number() }).nullable(),
});
export type PropDrillingSummary = z.infer<typeof propDrillingSummarySchema>;

export const propDrillingResultSchema = z.object({
  path: z.string(),
  is_directory: z.boolean(),
  threaded_parameters: z.array(threadedParameterSchema),
  summary: propDrillingSummarySchema,
});
export type PropDrillingResult = z.infer<typeof propDrillingResultSchema>;

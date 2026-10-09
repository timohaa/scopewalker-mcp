import { z } from "zod";

export const complexityHotspotSchema = z.object({
  function: z.string(),
  line: z.number(),
  issue: z.string(),
  value: z.number(),
  recommendation: z.string(),
});
export type ComplexityHotspot = z.infer<typeof complexityHotspotSchema>;

/** Radon's cyclomatic bands: "high" above 10, "extreme" above 30. */
export const complexitySeveritySchema = z.enum(["high", "extreme"]);
export type ComplexitySeverity = z.infer<typeof complexitySeveritySchema>;

export const functionComplexitySchema = z.object({
  name: z.string(),
  line: z.number(),
  cyclomatic_complexity: z.number(),
  cognitive_complexity: z.number(),
  nesting_depth: z.number(),
  severity: complexitySeveritySchema,
});
export type FunctionComplexity = z.infer<typeof functionComplexitySchema>;

export const fileComplexitySchema = z.object({
  path: z.string(),
  metrics: z.object({
    max_nesting_depth: z.number(),
    avg_nesting_depth: z.number(),
    max_parameters: z.number(),
    avg_parameters: z.number(),
    dependency_count: z.number(),
    /** Whole-file sum. See max_cognitive_complexity for the worst single function. */
    cognitive_complexity: z.number(),
    function_count: z.number(),
    max_cyclomatic_complexity: z.number(),
    avg_cyclomatic_complexity: z.number(),
    max_cognitive_complexity: z.number(),
  }),
  /** Functions over the cyclomatic threshold, worst first, capped per file. */
  functions: z.array(functionComplexitySchema),
  hotspots: z.array(complexityHotspotSchema),
});
export type FileComplexity = z.infer<typeof fileComplexitySchema>;

export const complexityMetricsResultSchema = z.object({
  path: z.string(),
  files: z.array(fileComplexitySchema),
  summary: z.object({
    files_analyzed: z.number(),
    high_complexity_files: z.number(),
    high_complexity_functions: z.number(),
    total_hotspots: z.number(),
    most_complex_file: z
      .object({
        path: z.string(),
        cognitive_complexity: z.number(),
      })
      .nullable(),
    most_complex_function: z
      .object({
        path: z.string(),
        function: z.string(),
        line: z.number(),
        cyclomatic_complexity: z.number(),
      })
      .nullable(),
  }),
});
export type ComplexityMetricsResult = z.infer<typeof complexityMetricsResultSchema>;

import { z } from "zod";

export const oversizedFileSchema = z.object({
  path: z.string(),
  lines: z.number(),
  exceeds_by: z.number(),
});
export type OversizedFile = z.infer<typeof oversizedFileSchema>;

export const oversizedFunctionSchema = z.object({
  path: z.string(),
  function_name: z.string(),
  lines: z.number(),
  exceeds_by: z.number(),
  start_line: z.number(),
});
export type OversizedFunction = z.infer<typeof oversizedFunctionSchema>;

export const checkThresholdsResultSchema = z.object({
  path: z.string(),
  thresholds: z.object({
    max_file_lines: z.number(),
    max_function_lines: z.number(),
  }),
  violations: z.object({
    oversized_files: z.array(oversizedFileSchema),
    oversized_functions: z.array(oversizedFunctionSchema),
  }),
  summary: z.object({
    files_checked: z.number(),
    functions_checked: z.number(),
    file_violations: z.number(),
    function_violations: z.number(),
    /** Files the function pass could not analyze (e.g. over the 1MB AST size guard). */
    files_skipped: z.number(),
    /** False when files_skipped is nonzero, so oversized_functions may be incomplete. */
    scan_complete: z.boolean(),
  }),
});
export type CheckThresholdsResult = z.infer<typeof checkThresholdsResultSchema>;

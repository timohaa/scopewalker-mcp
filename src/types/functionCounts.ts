import { z } from "zod";
import { lineStatsSchema } from "./lineCounts.js";

export const functionInfoSchema = z.object({
  name: z.string(),
  line: z.number(),
});
export type FunctionInfo = z.infer<typeof functionInfoSchema>;

export const fileFunctionCountSchema = z.object({
  path: z.string(),
  language: z.string(),
  function_count: z.number(),
  functions: z.array(functionInfoSchema),
});
export type FileFunctionCount = z.infer<typeof fileFunctionCountSchema>;

const functionCountsSummarySchema = z.object({
  total_files_analyzed: z.number(),
  total_functions: z.number(),
  files_with_no_functions: z.number(),
});

export const functionCountsResultSchema = z.object({
  path: z.string(),
  is_directory: z.boolean(),
  files: z.array(fileFunctionCountSchema),
  summary: functionCountsSummarySchema,
});
export type FunctionCountsResult = z.infer<typeof functionCountsResultSchema>;

export const functionLineInfoSchema = z.object({
  name: z.string(),
  start_line: z.number(),
  end_line: z.number(),
  lines: lineStatsSchema,
});
export type FunctionLineInfo = z.infer<typeof functionLineInfoSchema>;

export const fileFunctionLineCountSchema = z.object({
  path: z.string(),
  language: z.string(),
  functions: z.array(functionLineInfoSchema),
});
export type FileFunctionLineCount = z.infer<typeof fileFunctionLineCountSchema>;

const functionLineCountsSummarySchema = z.object({
  total_functions: z.number(),
  average_lines_per_function: z.number(),
  largest_function: z
    .object({
      name: z.string(),
      file: z.string(),
      lines: z.number(),
    })
    .nullable(),
  functions_over_50_lines: z.number(),
});

export const functionLineCountsResultSchema = z.object({
  path: z.string(),
  is_directory: z.boolean(),
  files: z.array(fileFunctionLineCountSchema),
  summary: functionLineCountsSummarySchema,
});
export type FunctionLineCountsResult = z.infer<typeof functionLineCountsResultSchema>;

/**
 * get_functions returns the counts or the lines shape depending on `detail`.
 * MCP requires an object at the top of an output schema, so the variants are
 * merged field by field rather than offered as a top-level union.
 */
export const functionsResultSchema = z.object({
  path: z.string(),
  is_directory: z.boolean(),
  files: z.array(z.union([fileFunctionCountSchema, fileFunctionLineCountSchema])),
  summary: z.union([functionCountsSummarySchema, functionLineCountsSummarySchema]),
});

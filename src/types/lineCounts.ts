import { z } from "zod";

export const lineStatsSchema = z.object({
  total: z.number(),
  code: z.number(),
  blank: z.number(),
  comment: z.number(),
});
export type LineStats = z.infer<typeof lineStatsSchema>;

export const fileLineCountSchema = z.object({
  path: z.string(),
  lines: lineStatsSchema,
});
export type FileLineCount = z.infer<typeof fileLineCountSchema>;

export const lineCountsResultSchema = z.object({
  path: z.string(),
  is_directory: z.boolean(),
  files: z.array(fileLineCountSchema),
  summary: z.object({
    total_files: z.number(),
    total_lines: z.number(),
    total_code_lines: z.number(),
    total_blank_lines: z.number(),
    total_comment_lines: z.number(),
  }),
});
export type LineCountsResult = z.infer<typeof lineCountsResultSchema>;

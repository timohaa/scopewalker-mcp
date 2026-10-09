import { z } from "zod";

export const undocumentedItemSchema = z.object({
  path: z.string(),
  name: z.string(),
  type: z.enum(["function", "class", "method"]),
  line: z.number(),
  lines: z.number().optional(),
});
export type UndocumentedItem = z.infer<typeof undocumentedItemSchema>;

export const fileDocumentationSchema = z.object({
  path: z.string(),
  documented: z.number(),
  undocumented: z.number(),
  percentage: z.number(),
});
export type FileDocumentation = z.infer<typeof fileDocumentationSchema>;

export const documentationCoverageResultSchema = z.object({
  path: z.string(),
  coverage: z.object({
    documented: z.number(),
    undocumented: z.number(),
    percentage: z.number(),
  }),
  undocumented_items: z.array(undocumentedItemSchema),
  by_file: z.array(fileDocumentationSchema),
  summary: z.object({
    files_analyzed: z.number(),
    /** Supported files the scan could not read or parse, mostly ones over the size guard. */
    files_skipped: z.number(),
    /** False when a skipped file leaves the coverage percentage covering only part of the target. */
    scan_complete: z.boolean(),
    total_symbols: z.number(),
    fully_documented_files: z.number(),
    zero_documentation_files: z.number(),
  }),
  /** Present when results were truncated due to limit parameter */
  truncated: z
    .object({
      items: z.number(),
      total: z.number(),
    })
    .optional(),
});
export type DocumentationCoverageResult = z.infer<typeof documentationCoverageResultSchema>;

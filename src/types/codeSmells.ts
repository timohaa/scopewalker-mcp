import { z } from "zod";

export const codeSmellTypeSchema = z.enum([
  "todo",
  "fixme",
  "hack",
  "xxx",
  "bug",
  "unused",
  "deprecated",
  "unsafe_cast",
]);
export type CodeSmellType = z.infer<typeof codeSmellTypeSchema>;

export const codeSmellSchema = z.object({
  path: z.string(),
  line: z.number(),
  type: codeSmellTypeSchema,
  text: z.string(),
});
export type CodeSmell = z.infer<typeof codeSmellSchema>;

export const fileSmellsSchema = z.object({
  path: z.string(),
  smells: z.array(codeSmellSchema),
});
export type FileSmells = z.infer<typeof fileSmellsSchema>;

export const codeSmellsResultSchema = z.object({
  path: z.string(),
  is_directory: z.boolean(),
  files: z.array(fileSmellsSchema),
  summary: z.object({
    total_files_scanned: z.number(),
    files_with_smells: z.number(),
    total_smells: z.number(),
    by_type: z.record(codeSmellTypeSchema, z.number()),
  }),
});
export type CodeSmellsResult = z.infer<typeof codeSmellsResultSchema>;

import { z } from "zod";
import { inventoryItemSchema } from "./codeInventory.js";

export const deadCodeSymbolTypeSchema = z.union([
  inventoryItemSchema.shape.type,
  z.literal("method"),
]);
export type DeadCodeSymbolType = z.infer<typeof deadCodeSymbolTypeSchema>;

/**
 * How far a symbol can be reached from.
 *
 * The scan can only prove a symbol dead when everything able to reach it was
 * scanned, so the scope decides which list a finding lands in.
 */
export type SymbolScope = "local" | "package" | "public";

export const deadCodeItemSchema = z.object({
  file: z.string(),
  name: z.string(),
  type: deadCodeSymbolTypeSchema,
  line: z.number(),
});
export type DeadCodeItem = z.infer<typeof deadCodeItemSchema>;

/** A declared symbol under test, with the token its references are counted under. */
export interface DeadCodeCandidate extends DeadCodeItem {
  key: string;
  scope: SymbolScope;
}

export const deadCodeSummarySchema = z.object({
  files_scanned: z.number(),
  files_skipped: z.number(),
  scan_complete: z.boolean(),
  symbols_checked: z.number(),
  dead_code_found: z.number(),
  unreferenced_exports_found: z.number(),
});
export type DeadCodeSummary = z.infer<typeof deadCodeSummarySchema>;

export const deadCodeResultSchema = z.object({
  path: z.string(),
  is_directory: z.boolean(),
  dead_code: z.array(deadCodeItemSchema),
  unreferenced_exports: z.array(deadCodeItemSchema),
  summary: deadCodeSummarySchema,
});
export type DeadCodeResult = z.infer<typeof deadCodeResultSchema>;

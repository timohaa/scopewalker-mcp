import { z } from "zod";

export const methodVisibilitySchema = z.enum(["public", "private", "protected"]);
export type MethodVisibility = z.infer<typeof methodVisibilitySchema>;

export const methodInfoSchema = z.object({
  name: z.string(),
  line: z.number(),
  visibility: methodVisibilitySchema,
});
export type MethodInfo = z.infer<typeof methodInfoSchema>;

export const inventoryItemSchema = z.object({
  name: z.string(),
  type: z.enum(["class", "function", "interface", "enum", "constant"]),
  line: z.number(),
  exported: z.boolean(),
  methods: z.array(methodInfoSchema).optional(),
});
export type InventoryItem = z.infer<typeof inventoryItemSchema>;

export const fileInventorySchema = z.object({
  file: z.string(),
  items: z.array(inventoryItemSchema),
});
export type FileInventory = z.infer<typeof fileInventorySchema>;

export const codeInventoryResultSchema = z.object({
  path: z.string(),
  inventory: z.array(fileInventorySchema),
  summary: z.object({
    total_files: z.number(),
    total_classes: z.number(),
    total_functions: z.number(),
    total_methods: z.number(),
    exported_symbols: z.number(),
  }),
});
export type CodeInventoryResult = z.infer<typeof codeInventoryResultSchema>;

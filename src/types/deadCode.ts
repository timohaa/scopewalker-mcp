import type { InventoryItem } from "./codeInventory.js";

export type DeadCodeSymbolType = InventoryItem["type"] | "method";

/**
 * How far a symbol can be reached from.
 *
 * The scan can only prove a symbol dead when everything able to reach it was
 * scanned, so the scope decides which list a finding lands in.
 */
export type SymbolScope = "local" | "package" | "public";

export interface DeadCodeItem {
  file: string;
  name: string;
  type: DeadCodeSymbolType;
  line: number;
}

/** A declared symbol under test, with the token its references are counted under. */
export interface DeadCodeCandidate extends DeadCodeItem {
  key: string;
  scope: SymbolScope;
}

export interface DeadCodeSummary {
  files_scanned: number;
  files_skipped: number;
  scan_complete: boolean;
  symbols_checked: number;
  dead_code_found: number;
  unreferenced_exports_found: number;
}

export interface DeadCodeResult {
  path: string;
  is_directory: boolean;
  dead_code: DeadCodeItem[];
  unreferenced_exports: DeadCodeItem[];
  summary: DeadCodeSummary;
}

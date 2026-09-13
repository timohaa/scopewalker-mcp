import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { CodeInventoryResult, InventoryItem } from "../types/index.js";
import { registerCodeInventoryTool } from "./codeInventory.js";

/**
 * Go names each constant on a nested spec, and Rust declares one under
 * `const_item` or `static_item`.
 */

let testDir: string;
const handler = getToolHandler(registerCodeInventoryTool, "get_code_inventory");

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-inv-constants-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });

  await writeFile(
    join(testDir, "limits.go"),
    `package main

const MaxRetries = 3

const (
	Alpha = 1
	beta  = 2
)
`
  );

  await writeFile(
    join(testDir, "limits.rs"),
    `pub const MAX: i32 = 3;
pub static NAME: &str = "x";
const HIDDEN: i32 = 1;
`
  );
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/** Runs the tool over one fixture file and returns its result. */
async function inventoryOf(file: string, includePrivate = false): Promise<CodeInventoryResult> {
  const response = await handler({
    path: join(testDir, file),
    include_private: includePrivate,
  });
  return parseContent<CodeInventoryResult>(response);
}

/** Finds one item of a single-file inventory by name. */
function itemNamed(result: CodeInventoryResult, name: string): InventoryItem | undefined {
  return result.inventory[0]?.items.find((item) => item.name === name);
}

describe("codeInventory - Go constants", () => {
  it("inventories a single constant and every spec of a grouped block", async () => {
    const result = await inventoryOf("limits.go", true);
    const items = result.inventory[0]?.items ?? [];

    expect(items.map((item) => [item.name, item.type, item.line])).toEqual([
      ["MaxRetries", "constant", 3],
      ["Alpha", "constant", 6],
      ["beta", "constant", 7],
    ]);
  });

  it("filters an unexported constant from the default view", async () => {
    const result = await inventoryOf("limits.go");
    const items = result.inventory[0]?.items ?? [];

    expect(items.map((item) => item.name)).toEqual(["MaxRetries", "Alpha"]);
    expect(result.summary.exported_symbols).toBe(2);
    expect(result.summary.total_classes).toBe(0);
    expect(result.summary.total_functions).toBe(0);
  });
});

describe("codeInventory - Rust constants", () => {
  it("inventories const and static items", async () => {
    const result = await inventoryOf("limits.rs");

    expect(itemNamed(result, "MAX")?.type).toBe("constant");
    expect(itemNamed(result, "NAME")?.type).toBe("constant");
    expect(result.summary.exported_symbols).toBe(2);
  });

  it("filters a constant without pub from the default view", async () => {
    const result = await inventoryOf("limits.rs");
    expect(itemNamed(result, "HIDDEN")).toBeUndefined();

    const withPrivate = await inventoryOf("limits.rs", true);
    expect(itemNamed(withPrivate, "HIDDEN")?.exported).toBe(false);
  });
});

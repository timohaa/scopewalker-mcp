import { mkdir, rm, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { CodeInventoryResult, DeadCodeResult } from "../types/index.js";
import { registerCodeInventoryTool } from "./codeInventory.js";
import { registerDeadCodeTool } from "./deadCode.js";

let testDir: string;
const handler = getToolHandler(registerCodeInventoryTool, "get_code_inventory");
const deadCodeHandler = getToolHandler(registerDeadCodeTool, "find_dead_code");

beforeAll(async () => {
  const tempPath = join(tmpdir(), `scopewalker-inv-go-grouped-${String(Date.now())}`);
  await mkdir(join(tempPath, "grouped"), { recursive: true });
  testDir = await realpath(tempPath);
  await writeFile(
    join(testDir, "grouped", "types.go"),
    `package p

type (
    Celsius float64
    Widget  struct{ X int }
    Shape   interface{ Area() float64 }
)

func (w Widget) Draw() {}
`
  );
  await writeFile(
    join(testDir, "grouped", "methods.go"),
    `package p

func (c Celsius) Kelvin() float64 { return float64(c) + 273.15 }
func (w *Widget) Resize() {}
func (w *Widget) hidden() {}
`
  );
  await writeFile(join(testDir, "single.go"), "package p\n\ntype Widget struct{}\n");
  await writeFile(
    join(testDir, "aliases.go"),
    `package p

type (
    Number = float64
    Record = struct{ X int }
    Contract = interface{ Run() }
    privateRecord struct{}
    privateAlias = struct{}
)
`
  );
  await mkdir(join(testDir, "unused"));
  await writeFile(
    join(testDir, "unused", "types.go"),
    "package p\n\ntype (\n    Public float64\n    privateRecord struct{}\n    Contract interface{}\n)\n"
  );
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/** Reads inventory for a fixture file or package directory. */
async function inventoryOf(path: string, includePrivate = false): Promise<CodeInventoryResult> {
  const response = await handler({ path: join(testDir, path), include_private: includePrivate });
  expect(response.isError).toBeUndefined();
  return parseContent<CodeInventoryResult>(response);
}

describe("codeInventory - grouped Go types", () => {
  it("emits each type spec at its own line and keeps ungrouped declarations singular", async () => {
    const result = await inventoryOf("grouped/types.go");
    const items = result.inventory[0]?.items ?? [];

    expect(items.map(({ name, type, line, exported }) => ({ name, type, line, exported }))).toEqual(
      [
        { name: "Celsius", type: "interface", line: 4, exported: true },
        { name: "Widget", type: "class", line: 5, exported: true },
        { name: "Shape", type: "interface", line: 6, exported: true },
      ]
    );
    expect(result.summary.total_classes).toBe(1);
    expect(result.summary.exported_symbols).toBe(3);

    const single = await inventoryOf("single.go");
    expect(single.inventory[0]?.items).toEqual([
      { name: "Widget", type: "class", line: 3, exported: true },
    ]);
  });

  it("classifies aliases by their own child and preserves private filtering", async () => {
    const result = await inventoryOf("aliases.go");
    expect(result.inventory[0]?.items).toEqual([
      { name: "Number", type: "interface", line: 4, exported: true },
      { name: "Record", type: "class", line: 5, exported: true },
      { name: "Contract", type: "interface", line: 6, exported: true },
    ]);

    const withPrivate = await inventoryOf("aliases.go", true);
    expect(withPrivate.inventory[0]?.items.slice(3)).toEqual([
      { name: "privateRecord", type: "class", line: 7, exported: false },
      { name: "privateAlias", type: "class", line: 8, exported: false },
    ]);
    expect(withPrivate.summary.exported_symbols).toBe(3);
    expect(withPrivate.summary.total_classes).toBe(3);
  });

  it("attaches receivers to grouped types within and across files with method visibility", async () => {
    const result = await inventoryOf("grouped");
    const items = result.inventory.flatMap((file) => file.items);
    expect(items.find((item) => item.name === "Widget")?.methods).toEqual([
      { name: "Resize", line: 4, visibility: "public" },
      { name: "Draw", line: 9, visibility: "public" },
    ]);
    expect(items.find((item) => item.name === "Celsius")?.methods).toEqual([
      { name: "Kelvin", line: 3, visibility: "public" },
    ]);
    expect(result.summary.total_methods).toBe(3);

    const withPrivate = await inventoryOf("grouped", true);
    const widget = withPrivate.inventory
      .flatMap((file) => file.items)
      .find((item) => item.name === "Widget");
    expect(widget?.methods?.map((method) => method.name)).toEqual(["Resize", "hidden", "Draw"]);
  });

  it("discovers every grouped type in dead-code analysis with its own scope and line", async () => {
    const response = await deadCodeHandler({ path: join(testDir, "unused") });
    expect(response.isError).toBeUndefined();
    const result = parseContent<DeadCodeResult>(response);

    expect(result.summary.scan_complete).toBe(true);
    expect(result.dead_code).toEqual([
      { file: "types.go", name: "privateRecord", type: "class", line: 5 },
    ]);
    expect(result.unreferenced_exports).toEqual([
      { file: "types.go", name: "Public", type: "interface", line: 4 },
      { file: "types.go", name: "Contract", type: "interface", line: 6 },
    ]);
  });
});

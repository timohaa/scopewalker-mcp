import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { CodeInventoryResult, InventoryItem } from "../types/index.js";
import { registerCodeInventoryTool } from "./codeInventory.js";

/**
 * TypeScript declares an abstract class and a field-bound method under node
 * types of their own, and can export a symbol away from its declaration.
 */

let testDir: string;
const handler = getToolHandler(registerCodeInventoryTool, "get_code_inventory");

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-inv-ts-members-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });

  await writeFile(
    join(testDir, "shape.ts"),
    `abstract class Shape {
  abstract area(): number;
  private handleClick = (e: MouseEvent) => { void e; };
  protected onDrag = function () { return 1; };
  #secret = () => 2;
  label = "square";
  describe(): string {
    return "shape";
  }
}
`
  );

  await writeFile(
    join(testDir, "exports.ts"),
    `const A = () => 1;
function B() { return 2; }
class C {}
interface D { x: number }
function unexported() { return 3; }

export { A, B, C as CeeAlias };
export type { D };
export default B;
`
  );

  await writeFile(
    join(testDir, "legacy.js"),
    `function helper() { return 1; }
class Store {}
function inner() { return 2; }

module.exports = { helper, Store };
exports.renamed = inner;
`
  );

  await writeFile(
    join(testDir, "direct.ts"),
    `export default function Widget() { return 1; }
export default class Panel {}
`
  );
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/** Runs the tool over one fixture file and returns its items. */
async function itemsOf(file: string): Promise<InventoryItem[]> {
  const response = await handler({ path: join(testDir, file), include_private: true });
  const result = parseContent<CodeInventoryResult>(response);
  return result.inventory[0]?.items ?? [];
}

/** Reads one file's summary. */
async function summaryOf(file: string): Promise<CodeInventoryResult["summary"]> {
  const response = await handler({ path: join(testDir, file), include_private: true });
  return parseContent<CodeInventoryResult>(response).summary;
}

describe("codeInventory - TypeScript class members", () => {
  it("inventories an abstract class with its members", async () => {
    const shape = (await itemsOf("shape.ts")).find((item) => item.name === "Shape");

    expect(shape?.type).toBe("class");
    expect(shape?.methods?.map((m) => m.name)).toEqual([
      "area",
      "handleClick",
      "onDrag",
      "#secret",
      "describe",
    ]);
  });

  it("gives a field-bound method the field's declared visibility", async () => {
    const shape = (await itemsOf("shape.ts")).find((item) => item.name === "Shape");
    const byName = new Map((shape?.methods ?? []).map((m) => [m.name, m.visibility]));

    expect(byName.get("handleClick")).toBe("private");
    expect(byName.get("onDrag")).toBe("protected");
    expect(byName.get("#secret")).toBe("private");
    // A field holding a plain value is not a method
    expect(byName.has("label")).toBe(false);
  });

  it("counts an abstract class and its methods in the summary", async () => {
    const summary = await summaryOf("shape.ts");

    expect(summary.total_classes).toBe(1);
    expect(summary.total_methods).toBe(5);
    expect(summary.total_functions).toBe(0);
  });
});

describe("codeInventory - TypeScript indirect exports", () => {
  it("marks names listed in an export clause, including renamed ones", async () => {
    const byName = new Map((await itemsOf("exports.ts")).map((item) => [item.name, item.exported]));

    expect(byName.get("A")).toBe(true);
    expect(byName.get("B")).toBe(true);
    expect(byName.get("C")).toBe(true);
    expect(byName.get("D")).toBe(true);
    expect(byName.get("unexported")).toBe(false);
  });

  it("counts indirectly exported symbols in the summary", async () => {
    expect((await summaryOf("exports.ts")).exported_symbols).toBe(4);
  });

  it("marks names exported through module.exports and exports.X", async () => {
    const byName = new Map((await itemsOf("legacy.js")).map((item) => [item.name, item.exported]));

    expect(byName.get("helper")).toBe(true);
    expect(byName.get("Store")).toBe(true);
    expect(byName.get("inner")).toBe(true);
  });

  it("still marks a declaration exported in place", async () => {
    const items = await itemsOf("direct.ts");

    expect(items.map((item) => [item.name, item.exported])).toEqual([
      ["Widget", true],
      ["Panel", true],
    ]);
  });
});

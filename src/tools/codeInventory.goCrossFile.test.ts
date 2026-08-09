import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { CodeInventoryResult, InventoryItem } from "../types/index.js";
import { registerCodeInventoryTool } from "./codeInventory.js";

/**
 * Go declares methods outside the type body and routinely splits a type from its
 * methods across files, so receivers can only be matched after every file in the
 * package has been read. These cover that cross-file path and the package
 * boundary that keeps same-named types in different directories apart.
 */

let testDir: string;
const handler = getToolHandler(registerCodeInventoryTool, "get_code_inventory");

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-inv-go-xfile-${String(Date.now())}`);

  // Package `a`: type declared in one file, methods in two others.
  await mkdir(join(testDir, "a"), { recursive: true });
  await writeFile(
    join(testDir, "a", "types.go"),
    `package a

type Point struct{ X int }

type Config struct{ Name string }

type Stack[T any] struct{ items []T }
`
  );
  await writeFile(
    join(testDir, "a", "methods.go"),
    `package a

func (p *Point) Scale(f int) {}

func (p Point) Value() int { return p.X }

func (c *Config) Reload() {}

func (c *Config) hidden() {}

func (s *Stack[T]) Push(v T) {}
`
  );
  await writeFile(
    join(testDir, "a", "more_methods.go"),
    `package a

func (p *Point) Translate(dx int) {}
`
  );

  // Package `b`: a same-named type that must not collect package a's methods.
  await mkdir(join(testDir, "b"), { recursive: true });
  await writeFile(
    join(testDir, "b", "types.go"),
    `package b

type Config struct{ Other int }
`
  );
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/** Runs the tool over the fixture and indexes items by "<dir>/<name>". */
async function inventoryByQualifiedName(
  includePrivate = false
): Promise<Map<string, InventoryItem>> {
  const response = await handler({
    path: testDir,
    limit: 100,
    include_private: includePrivate,
  });
  const result = parseContent<CodeInventoryResult>(response);

  const index = new Map<string, InventoryItem>();
  for (const file of result.inventory) {
    const pkg = file.file.split("/")[0];
    for (const item of file.items) index.set(`${pkg}/${item.name}`, item);
  }
  return index;
}

const methodNames = (item: InventoryItem | undefined): string[] =>
  (item?.methods ?? []).map((m) => m.name);

describe("codeInventory - Go methods across files", () => {
  it("attaches methods declared in a different file from their type", async () => {
    const items = await inventoryByQualifiedName();

    // Previously every one of these was dropped: the receiver had no match in
    // its own file, so the method appeared nowhere in the output.
    expect(methodNames(items.get("a/Point"))).toContain("Scale");
    expect(methodNames(items.get("a/Config"))).toContain("Reload");
  });

  it("attaches both pointer and value receivers", async () => {
    const items = await inventoryByQualifiedName();
    const point = methodNames(items.get("a/Point"));

    expect(point).toContain("Scale"); // func (p *Point)
    expect(point).toContain("Value"); // func (p Point)
  });

  it("attaches a generic receiver to its type", async () => {
    const items = await inventoryByQualifiedName();
    expect(methodNames(items.get("a/Stack"))).toContain("Push");
  });

  it("does not attach one package's methods to a same-named type in another", async () => {
    const items = await inventoryByQualifiedName();

    expect(methodNames(items.get("a/Config"))).toContain("Reload");
    expect(methodNames(items.get("b/Config"))).toEqual([]);
  });

  it("orders methods by file then line, independent of walk order", async () => {
    const items = await inventoryByQualifiedName();

    // "methods.go" < "more_methods.go", so its methods come first; within a file,
    // line order decides. Without the sort this would follow filesystem walk order.
    expect(methodNames(items.get("a/Point"))).toEqual(["Scale", "Value", "Translate"]);
  });

  it("counts cross-file methods in the summary", async () => {
    const response = await handler({ path: testDir, limit: 100 });
    const result = parseContent<CodeInventoryResult>(response);

    // Scale, Value, Translate, Reload, Push — `hidden` is private and excluded.
    expect(result.summary.total_methods).toBe(5);
  });

  it("excludes unexported methods unless include_private is set", async () => {
    const withoutPrivate = await inventoryByQualifiedName(false);
    expect(methodNames(withoutPrivate.get("a/Config"))).not.toContain("hidden");

    const withPrivate = await inventoryByQualifiedName(true);
    expect(methodNames(withPrivate.get("a/Config"))).toContain("hidden");
  });
});

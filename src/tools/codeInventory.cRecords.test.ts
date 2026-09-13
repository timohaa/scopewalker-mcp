import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { CodeInventoryResult } from "../types/index.js";
import { registerCodeInventoryTool } from "./codeInventory.js";

/**
 * C reuses one node type to declare a record and to name one, and hides a
 * pointer-returning function's name below a pointer_declarator.
 */

let testDir: string;
const handler = getToolHandler(registerCodeInventoryTool, "get_code_inventory");

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-inv-c-records-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });

  await writeFile(
    join(testDir, "refs.c"),
    `struct Bar { int x; };

void take_bar(struct Bar *b) {
  b->x = 1;
}

int read_bar(const struct Bar *b) {
  return b->x;
}
`
  );

  await writeFile(
    join(testDir, "fields.c"),
    `struct Point {
  int x;
  int y;
};

struct Line {
  struct Point start;
  struct Point end;
};

int main(void) {
  struct Line l;
  return l.start.x;
}
`
  );

  await writeFile(
    join(testDir, "ptr.c"),
    `struct Foo *make_foo(void) {
  return 0;
}

int make_int(void) {
  return 1;
}

char *make_str(void) {
  return 0;
}

static struct Foo *
make_foo_split(void) {
  return 0;
}
`
  );

  await writeFile(
    join(testDir, "shapes.c"),
    `typedef struct { int x; } anon_t;

typedef struct Tag { int y; } tag_t;

union Value { int i; float f; };

enum Color { RED, GREEN };

void paint(enum Color c, union Value v) {}
`
  );
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/** Runs the tool over one fixture file and returns its result. */
async function inventoryOf(file: string): Promise<CodeInventoryResult> {
  const response = await handler({ path: join(testDir, file) });
  return parseContent<CodeInventoryResult>(response);
}

describe("codeInventory - C record references", () => {
  it("counts a struct once however often a pointer parameter names it", async () => {
    const result = await inventoryOf("refs.c");
    const names = (result.inventory[0]?.items ?? []).map((item) => item.name);

    expect(names).toEqual(["Bar", "take_bar", "read_bar"]);
    expect(result.summary.total_classes).toBe(1);
    expect(result.summary.total_functions).toBe(2);
  });

  it("ignores a struct named by a field or a local variable", async () => {
    const result = await inventoryOf("fields.c");
    const items = result.inventory[0]?.items ?? [];

    expect(items.filter((item) => item.name === "Point")).toHaveLength(1);
    expect(items.filter((item) => item.name === "Line")).toHaveLength(1);
    expect(result.summary.total_classes).toBe(2);
    expect(result.summary.total_functions).toBe(1);
  });

  it("names a pointer-returning function by its declarator", async () => {
    const result = await inventoryOf("ptr.c");
    const items = result.inventory[0]?.items ?? [];

    expect(items.map((item) => item.name)).toEqual([
      "make_foo",
      "make_int",
      "make_str",
      "make_foo_split",
    ]);
    expect(result.summary.total_functions).toBe(4);
    // `struct Foo` is only ever a return type here, never declared
    expect(result.summary.total_classes).toBe(0);
  });

  it("inventories a union with a body and skips the same union named as a parameter", async () => {
    const result = await inventoryOf("shapes.c");
    const items = result.inventory[0]?.items ?? [];
    const byName = new Map(items.map((item) => [item.name, item]));

    expect(byName.get("Value")?.type).toBe("class");
    expect(byName.get("Color")?.type).toBe("enum");
    expect(byName.get("Tag")?.type).toBe("class");
    expect(byName.get("paint")?.type).toBe("function");
    // A tag-less `typedef struct {...} anon_t` states no name the record itself carries
    expect(byName.has("anon_t")).toBe(false);
    expect(result.summary.total_classes).toBe(2);
    expect(result.summary.total_functions).toBe(1);
    expect(result.summary.exported_symbols).toBe(0);
  });
});

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { CodeInventoryResult, InventoryItem } from "../types/index.js";
import { registerCodeInventoryTool } from "./codeInventory.js";

/**
 * C++ gives constructors, destructors and operators node types of their own, and
 * lets a member be defined outside the class body it belongs to.
 */

let testDir: string;
const handler = getToolHandler(registerCodeInventoryTool, "get_code_inventory");

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-inv-cpp-members-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });

  await writeFile(
    join(testDir, "widget.hpp"),
    `class W {
public:
    W();
    W(int n);
    ~W();
    bool operator==(const W & o) const;
    int  size() const;
    static W make();
    virtual void draw();
private:
    int n_;
};
`
  );

  await writeFile(
    join(testDir, "widget.cpp"),
    `class Widget {
public:
    Widget();
    int size() const;
private:
    void helper();
    int n_;
};

Widget::Widget() { n_ = 0; }
int Widget::size() const { return n_; }
void Widget::helper() { n_++; }
char *Widget::label() { return 0; }

void Detached::run() {}

int free_function(int x) { return x; }
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

describe("codeInventory - C++ class members", () => {
  it("lists constructors, destructors and operators declared in the class body", async () => {
    const result = await inventoryOf("widget.hpp");
    const methods = itemNamed(result, "W")?.methods ?? [];

    expect(methods.map((m) => m.name)).toEqual([
      "W",
      "W",
      "~W",
      "operator==",
      "size",
      "make",
      "draw",
    ]);
    expect(result.summary.total_methods).toBe(7);
    expect(result.summary.total_classes).toBe(1);
    expect(result.summary.total_functions).toBe(0);
  });

  it("attaches an out-of-line definition to its class instead of listing it twice", async () => {
    const result = await inventoryOf("widget.cpp");
    const items = result.inventory[0]?.items ?? [];

    expect(itemNamed(result, "Widget")?.methods?.map((m) => m.name)).toEqual(["Widget", "size"]);
    expect(items.some((item) => item.name.startsWith("Widget::"))).toBe(false);
    expect(result.summary.total_functions).toBe(2);
    expect(result.summary.total_methods).toBe(2);
  });

  it("keeps an out-of-line definition whose class the file never declares", async () => {
    const result = await inventoryOf("widget.cpp");

    expect(itemNamed(result, "Detached::run")?.type).toBe("function");
    expect(itemNamed(result, "free_function")?.type).toBe("function");
  });

  it("does not leak a private member through its out-of-line definition", async () => {
    const result = await inventoryOf("widget.cpp");
    const names = (result.inventory[0]?.items ?? []).map((item) => item.name);

    expect(names).not.toContain("Widget::helper");
    expect(names).not.toContain("helper");
  });

  it("reports a private member as a method only with include_private", async () => {
    const result = await inventoryOf("widget.cpp", true);
    const methods = itemNamed(result, "Widget")?.methods ?? [];

    expect(methods.find((m) => m.name === "helper")?.visibility).toBe("private");
  });
});

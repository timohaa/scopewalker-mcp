import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { CodeInventoryResult } from "../types/index.js";
import { registerCodeInventoryTool } from "./codeInventory.js";

describe("codeInventory tool - Python", () => {
  let pyTestDir: string;
  const pyHandler = getToolHandler(registerCodeInventoryTool, "get_code_inventory");

  beforeAll(async () => {
    pyTestDir = join(tmpdir(), `scopewalker-inv-py-test-${String(Date.now())}`);
    await mkdir(pyTestDir, { recursive: true });

    await writeFile(
      join(pyTestDir, "module.py"),
      `"""Module docstring."""

def public_function():
    """A public function."""
    pass

class PublicClass:
    """A public class."""

    def method(self):
        pass

def _private_function():
    pass
`
    );

    await writeFile(
      join(pyTestDir, "widget.py"),
      `def top_level():
    pass

class Widget:
    def bar(self):
        def inner():
            pass
        return inner
`
    );
  });

  afterAll(async () => {
    await rm(pyTestDir, { recursive: true, force: true });
  });

  it("indexes Python module-level symbols as exported", async () => {
    const response = await pyHandler({ path: pyTestDir });
    const result = parseContent<CodeInventoryResult>(response);

    const pyFile = result.inventory.find((f) => f.file.endsWith("module.py"));
    if (pyFile) {
      // Module-level items in Python should be considered exported
      const publicFunc = pyFile.items.find((i) => i.name === "public_function");
      const publicClass = pyFile.items.find((i) => i.name === "PublicClass");

      expect(publicFunc?.exported).toBe(true);
      expect(publicClass?.exported).toBe(true);
    }
  });

  it("indexes Python module-level defs as functions, distinct from class methods", async () => {
    const response = await pyHandler({ path: pyTestDir });
    const result = parseContent<CodeInventoryResult>(response);

    const pyFile = result.inventory.find((f) => f.file.endsWith("widget.py"));
    const topLevelFn = pyFile?.items.find((i) => i.name === "top_level");
    expect(topLevelFn?.type).toBe("function");

    const widgetClass = pyFile?.items.find((i) => i.name === "Widget");
    expect(widgetClass?.type).toBe("class");
    expect(widgetClass?.methods?.map((m) => m.name)).toContain("bar");
    // Class methods must not also appear as standalone top-level items
    expect(pyFile?.items.some((i) => i.name === "bar")).toBe(false);
  });

  it("does not count defs nested inside method bodies as class methods", async () => {
    const response = await pyHandler({ path: pyTestDir });
    const result = parseContent<CodeInventoryResult>(response);

    const pyFile = result.inventory.find((f) => f.file.endsWith("widget.py"));
    const widgetClass = pyFile?.items.find((i) => i.name === "Widget");
    expect(widgetClass?.methods?.map((m) => m.name)).toEqual(["bar"]);
  });
});

describe("codeInventory tool - C", () => {
  let cTestDir: string;
  const cHandler = getToolHandler(registerCodeInventoryTool, "get_code_inventory");

  beforeAll(async () => {
    cTestDir = join(tmpdir(), `scopewalker-inv-c-test-${String(Date.now())}`);
    await mkdir(cTestDir, { recursive: true });

    await writeFile(
      join(cTestDir, "math.c"),
      `int add(int a, int b) {
    return a + b;
}

void greet(void) {
}
`
    );
  });

  afterAll(async () => {
    await rm(cTestDir, { recursive: true, force: true });
  });

  it("indexes C functions via their function_declarator names", async () => {
    const response = await cHandler({ path: cTestDir });
    const result = parseContent<CodeInventoryResult>(response);

    const cFile = result.inventory.find((f) => f.file.endsWith("math.c"));
    expect(cFile).toBeDefined();

    const names = cFile?.items.map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(["add", "greet"]));
    expect(cFile?.items.every((i) => i.type === "function")).toBe(true);
    expect(result.summary.total_functions).toBe(2);
  });
});

describe("codeInventory tool - Ruby", () => {
  let rbTestDir: string;
  const rbHandler = getToolHandler(registerCodeInventoryTool, "get_code_inventory");

  beforeAll(async () => {
    rbTestDir = join(tmpdir(), `scopewalker-inv-rb-test-${String(Date.now())}`);
    await mkdir(rbTestDir, { recursive: true });

    await writeFile(
      join(rbTestDir, "calculator.rb"),
      `def add(a, b)
  a + b
end

class Calculator
  def multiply(a, b)
    a * b
  end

  def _internal(a, b)
    a - b
  end
end
`
    );
  });

  afterAll(async () => {
    await rm(rbTestDir, { recursive: true, force: true });
  });

  it("indexes Ruby module-level defs as functions, distinct from class methods", async () => {
    const response = await rbHandler({ path: rbTestDir });
    const result = parseContent<CodeInventoryResult>(response);

    const rbFile = result.inventory.find((f) => f.file.endsWith("calculator.rb"));
    const addFn = rbFile?.items.find((i) => i.name === "add");
    expect(addFn?.type).toBe("function");

    const calculatorClass = rbFile?.items.find((i) => i.name === "Calculator");
    expect(calculatorClass?.type).toBe("class");
    expect(calculatorClass?.methods?.map((m) => m.name)).toContain("multiply");
    // Class methods must not also appear as standalone top-level items
    expect(rbFile?.items.some((i) => i.name === "multiply")).toBe(false);
  });

  it("treats underscore-prefixed Ruby methods as private", async () => {
    const response = await rbHandler({ path: rbTestDir, include_private: true });
    const result = parseContent<CodeInventoryResult>(response);

    const rbFile = result.inventory.find((f) => f.file.endsWith("calculator.rb"));
    const calculatorClass = rbFile?.items.find((i) => i.name === "Calculator");
    const internalMethod = calculatorClass?.methods?.find((m) => m.name === "_internal");
    expect(internalMethod?.visibility).toBe("private");
  });
});

// Go and Rust mark visibility in the language itself rather than with an export
// keyword, so reading only export statements reported every symbol as internal.
describe("codeInventory tool - Go and Rust visibility", () => {
  let visTestDir: string;
  const visHandler = getToolHandler(registerCodeInventoryTool, "get_code_inventory");

  beforeAll(async () => {
    visTestDir = join(tmpdir(), `scopewalker-inv-vis-test-${String(Date.now())}`);
    await mkdir(visTestDir, { recursive: true });

    await writeFile(
      join(visTestDir, "shapes.go"),
      `package main

type Point struct{ X int }

func Exported() {}

func unexported() {}

func (p *Point) Visible() {}

func (p *Point) hidden() {}
`
    );

    await writeFile(
      join(visTestDir, "widget.rs"),
      `pub struct Widget { w: u32 }

pub fn public_fn() {}

fn private_fn() {}

pub(crate) fn crate_fn() {}
`
    );
  });

  afterAll(async () => {
    await rm(visTestDir, { recursive: true, force: true });
  });

  it("reads Go export status from identifier capitalization", async () => {
    const response = await visHandler({ path: join(visTestDir, "shapes.go") });
    const result = parseContent<CodeInventoryResult>(response);

    const byName = new Map((result.inventory[0]?.items ?? []).map((i) => [i.name, i]));

    expect(byName.get("Point")?.exported).toBe(true);
    expect(byName.get("Exported")?.exported).toBe(true);
    expect(result.summary.exported_symbols).toBe(2);
  });

  it("treats lowercase Go symbols as private", async () => {
    const excluded = await visHandler({ path: join(visTestDir, "shapes.go") });
    const withoutPrivate = parseContent<CodeInventoryResult>(excluded);
    expect(withoutPrivate.inventory[0]?.items.some((i) => i.name === "unexported")).toBe(false);

    const included = await visHandler({
      path: join(visTestDir, "shapes.go"),
      include_private: true,
    });
    const withPrivate = parseContent<CodeInventoryResult>(included);
    const unexported = withPrivate.inventory[0]?.items.find((i) => i.name === "unexported");

    expect(unexported?.exported).toBe(false);
  });

  it("labels Go method visibility by receiver-method capitalization", async () => {
    const response = await visHandler({
      path: join(visTestDir, "shapes.go"),
      include_private: true,
    });
    const result = parseContent<CodeInventoryResult>(response);

    const point = result.inventory[0]?.items.find((i) => i.name === "Point");
    const byName = new Map((point?.methods ?? []).map((m) => [m.name, m.visibility]));

    expect(byName.get("Visible")).toBe("public");
    expect(byName.get("hidden")).toBe("private");
  });

  it("counts only bare `pub` Rust items as exported", async () => {
    const response = await visHandler({ path: join(visTestDir, "widget.rs") });
    const result = parseContent<CodeInventoryResult>(response);

    const byName = new Map((result.inventory[0]?.items ?? []).map((i) => [i.name, i]));

    expect(byName.get("Widget")?.exported).toBe(true);
    expect(byName.get("public_fn")?.exported).toBe(true);
    expect(byName.get("private_fn")?.exported).toBe(false);
    // pub(crate) stops at the crate boundary, so it is not public API
    expect(byName.get("crate_fn")?.exported).toBe(false);
  });
});

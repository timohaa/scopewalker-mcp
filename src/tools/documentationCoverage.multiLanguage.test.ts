import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { DocumentationCoverageResult } from "../types/index.js";
import { registerDocumentationCoverageTool } from "./documentationCoverage.js";

describe("documentationCoverage tool - multi-language", () => {
  let langTestDir: string;
  const langHandler = getToolHandler(
    registerDocumentationCoverageTool,
    "get_documentation_coverage"
  );

  beforeAll(async () => {
    langTestDir = join(tmpdir(), `scopewalker-doc-lang-test-${String(Date.now())}`);
    await mkdir(langTestDir, { recursive: true });

    await writeFile(
      join(langTestDir, "module.py"),
      `def add(a, b):
    """Adds two numbers."""
    return a + b


def subtract(a, b):
    x = a - b
    return x
`
    );

    await writeFile(
      join(langTestDir, "math.go"),
      `package main

// Add adds two numbers.
func Add(a int, b int) int {
	return a + b
}

func Subtract(a int, b int) int {
	return a - b
}
`
    );

    await writeFile(
      join(langTestDir, "calculator.rb"),
      `# Adds two numbers.
def add(a, b)
  a + b
end

def subtract(a, b)
  a - b
end
`
    );
  });

  afterAll(async () => {
    await rm(langTestDir, { recursive: true, force: true });
  });

  it("recognizes Python docstrings, including non-string first statements", async () => {
    const response = await langHandler({ path: join(langTestDir, "module.py") });
    const result = parseContent<DocumentationCoverageResult>(response);

    const names = result.undocumented_items.map((i) => i.name);
    expect(names).toContain("subtract");
    expect(names).not.toContain("add");
  });

  it("recognizes Go line-comment doc conventions", async () => {
    const response = await langHandler({ path: join(langTestDir, "math.go") });
    const result = parseContent<DocumentationCoverageResult>(response);

    const names = result.undocumented_items.map((i) => i.name);
    expect(names).toContain("Subtract");
    expect(names).not.toContain("Add");
  });

  it("recognizes Ruby line-comment doc conventions and top-level defs", async () => {
    const response = await langHandler({ path: join(langTestDir, "calculator.rb") });
    const result = parseContent<DocumentationCoverageResult>(response);

    const names = result.undocumented_items.map((i) => i.name);
    expect(names).toContain("subtract");
    expect(names).not.toContain("add");
  });
});

describe("documentationCoverage tool - C/C++", () => {
  let cppTestDir: string;
  const cppHandler = getToolHandler(
    registerDocumentationCoverageTool,
    "get_documentation_coverage"
  );

  beforeAll(async () => {
    cppTestDir = join(tmpdir(), `scopewalker-doc-cpp-test-${String(Date.now())}`);
    await mkdir(cppTestDir, { recursive: true });

    await writeFile(
      join(cppTestDir, "widget.cpp"),
      `/** Renders a widget. */
void render(int a) {}

void resize(int w) {}

/** Scales a widget. */
void Widget::scale(int f) {}
`
    );

    await writeFile(
      join(cppTestDir, "shapes.cpp"),
      `/** A widget. */
class Widget {
public:
  /** Draws it. */
  void draw(int a) {}
  int declOnly(int a);
  int field;
};

Point makePoint(int x) { return Point(); }
`
    );
  });

  afterAll(async () => {
    await rm(cppTestDir, { recursive: true, force: true });
  });

  // C/C++ definitions hide their name inside a declarator, so they were once
  // dropped entirely rather than counted as undocumented.
  it("sees C++ function definitions, including qualified ones", async () => {
    const response = await cppHandler({ path: join(cppTestDir, "widget.cpp") });
    const result = parseContent<DocumentationCoverageResult>(response);

    expect(result.summary.total_symbols).toBe(3);

    const names = result.undocumented_items.map((i) => i.name);
    expect(names).toContain("resize");
    expect(names).not.toContain("render");
    expect(names).not.toContain("Widget::scale");
  });

  it("counts C++ classes and types their members as methods", async () => {
    const response = await cppHandler({ path: join(cppTestDir, "shapes.cpp") });
    const result = parseContent<DocumentationCoverageResult>(response);

    // Widget, draw, declOnly, makePoint — the data member is not documentable
    expect(result.summary.total_symbols).toBe(4);
    // The class itself carries a doc comment, so it must count as documented
    expect(result.coverage.documented).toBe(2);

    const byName = new Map(result.undocumented_items.map((i) => [i.name, i.type]));
    expect(byName.get("declOnly")).toBe("method");
    expect(byName.has("field")).toBe(false);
  });

  it("names a C++ function by its declarator, not its return type", async () => {
    const response = await cppHandler({ path: join(cppTestDir, "shapes.cpp") });
    const result = parseContent<DocumentationCoverageResult>(response);

    // `Point makePoint(int)` puts a type_identifier ahead of the declarator
    const names = result.undocumented_items.map((i) => i.name);
    expect(names).toContain("makePoint");
    expect(names).not.toContain("Point");
  });
});

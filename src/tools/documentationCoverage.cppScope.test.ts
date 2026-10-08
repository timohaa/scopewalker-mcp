import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { DocumentationCoverageResult } from "../types/index.js";
import { registerDocumentationCoverageTool } from "./documentationCoverage.js";

const handler = getToolHandler(registerDocumentationCoverageTool, "get_documentation_coverage");
let testDir: string;

/** Writes fixture files into a fresh directory and scans the whole directory. */
async function scan(
  dirName: string,
  files: Record<string, string>,
  args: Record<string, unknown> = {}
): Promise<DocumentationCoverageResult> {
  const dir = join(testDir, dirName);
  await mkdir(dir, { recursive: true });
  for (const [name, source] of Object.entries(files)) {
    await writeFile(join(dir, name), source);
  }
  return parseContent<DocumentationCoverageResult>(await handler({ path: dir, ...args }));
}

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-doc-cpp-scope-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// C/C++ symbols are counted once per qualified name across the scan: a header
// declaration and its definition are one symbol, and private or file-local
// symbols are not counted at all.
describe("documentationCoverage - C++ visibility", () => {
  it("skips static free functions, anonymous namespaces and private members", async () => {
    const result = await scan("hidden", {
      "unit.cpp": `static int fileLocal() { return 1; }

namespace {
int internal() { return 2; }
}

/// A widget.
class Widget {
  int defaultPrivate();
public:
  int open();
  static int create();
protected:
  int forSubclasses();
private:
  int hidden();
  struct Detail { int nested(); };
};

/// A point.
struct Point {
  int x();
};
`,
    });
    const names = result.undocumented_items.map((item) => item.name);
    expect(names).toEqual(["open", "create", "forSubclasses", "x"]);
  });
});

describe("documentationCoverage - C++ header and source pairs", () => {
  it("credits a header doc comment to the out-of-line definition", async () => {
    const result = await scan("pair-documented", {
      "widget.hpp": `namespace ui {
/// A widget.
class Widget {
public:
  /// Slashes the widget.
  int slash();
};
}
`,
      "widget.cpp": `#include "widget.hpp"
namespace ui {
int Widget::slash() { return 1; }
}
`,
    });
    expect(result.undocumented_items).toEqual([]);
    expect(result.summary.total_symbols).toBe(2);
  });

  it("reports an undocumented pair once, at the header declaration", async () => {
    const result = await scan("pair-undocumented", {
      "api.h": `int compute(int x);
`,
      "api.cpp": `#include "api.h"

int compute(int x) {
  return x * 2;
}
`,
    });
    expect(result.undocumented_items).toEqual([
      { path: "api.h", name: "compute", type: "function", line: 1, lines: 3 },
    ]);
    expect(result.summary.total_symbols).toBe(1);
  });

  it("keeps a short header declaration when min_lines filters by definition length", async () => {
    const result = await scan(
      "pair-min-lines",
      {
        "api.h": `/// Computes.
int compute(int x);
`,
        "api.cpp": `int compute(int x) {
  return x * 2;
}
`,
      },
      { min_lines: 3 }
    );
    expect(result.undocumented_items).toEqual([]);
    expect(result.coverage.documented).toBe(1);
  });
});

describe("documentationCoverage - C++ merged symbol filtering", () => {
  it("matches a template class member defined out of line", async () => {
    const result = await scan("pair-template", {
      "box.hpp": `/// A box.
template <typename T>
class Box {
public:
  /// Reads the value.
  T get() const;
};

template <typename T>
T Box<T>::get() const { return T(); }
`,
    });
    expect(result.undocumented_items).toEqual([]);
  });

  it("leaves out the definition of a private member", async () => {
    const result = await scan("pair-private", {
      "widget.hpp": `/// A widget.
class Widget {
  int helper();
};
`,
      "widget.cpp": `int Widget::helper() { return 1; }
`,
    });
    expect(result.undocumented_items).toEqual([]);
    expect(result.summary.total_symbols).toBe(1);
  });

  it("counts overloads as separate symbols", async () => {
    const result = await scan("overloads", {
      "api.hpp": `int scale(int x);
double scale(double x);
`,
      "api.cpp": `int scale(int x) { return x; }
double scale(double x) { return x; }
`,
    });
    expect(result.summary.total_symbols).toBe(2);
    expect(result.undocumented_items.map((item) => item.path)).toEqual(["api.hpp", "api.hpp"]);
  });
});

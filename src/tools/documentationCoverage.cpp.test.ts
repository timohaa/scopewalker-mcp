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
  files: Record<string, string>
): Promise<DocumentationCoverageResult> {
  const dir = join(testDir, dirName);
  await mkdir(dir, { recursive: true });
  for (const [name, source] of Object.entries(files)) {
    await writeFile(join(dir, name), source);
  }
  return parseContent<DocumentationCoverageResult>(await handler({ path: dir }));
}

/** Names reported as undocumented for one C++ source file. */
async function undocumentedIn(dirName: string, source: string): Promise<string[]> {
  const result = await scan(dirName, { "unit.cpp": source });
  return result.undocumented_items.map((item) => item.name);
}

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-doc-cpp-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// C++ coverage was reported as unreliable: Doxygen comments, `template` lines,
// and C++-only declarator forms all produced false "undocumented" items.
describe("documentationCoverage - C++ Doxygen comment styles", () => {
  it("accepts ///, //!, /*! and /** as documentation", async () => {
    const result = await scan("styles", {
      "unit.cpp": `/// Triple slash.
int a();

//! Exclamation line.
int b();

/*! Exclamation block. */
int c();

/** Javadoc block. */
int d();

/// First line of a stacked block,
/// continued here.
int e();
`,
    });
    expect(result.undocumented_items).toEqual([]);
    expect(result.coverage.documented).toBe(5);
  });

  it("does not accept plain comments or //// banners", async () => {
    const names = await undocumentedIn(
      "plain",
      `// Plain line comment.
int a();

/* Plain block comment. */
int b();

////////////////////////////
int c();
`
    );
    expect(names).toEqual(["a", "b", "c"]);
  });

  it("credits a trailing ///< comment to its own member, not the next one", async () => {
    const names = await undocumentedIn(
      "trailing",
      `/** A widget. */
struct Widget {
  int width(); ///< Width in pixels.
  int height(); /**< Height in pixels. */
  ///< Stray trailing form on its own line.
  int depth();
};
`
    );
    expect(names).toEqual(["depth"]);
  });
});

describe("documentationCoverage - C++ template and linkage prefixes", () => {
  it("credits a comment above the template line", async () => {
    const names = await undocumentedIn(
      "template",
      `/// Identity.
template <typename T>
T identity(T x) { return x; }

/// A box.
template <typename T>
class Box {
public:
  /// Reads the value.
  template <typename U>
  U get() const;
};
`
    );
    expect(names).toEqual([]);
  });

  it("does not credit a comment separated from the template line by a blank line", async () => {
    const names = await undocumentedIn(
      "template-gap",
      `/// Unrelated note.

template <typename T>
T identity(T x) { return x; }
`
    );
    expect(names).toEqual(["identity"]);
  });

  it("types a member template as a method", async () => {
    const result = await scan("member-template", {
      "unit.cpp": `/// A box.
struct Box {
  template <typename U>
  U get() const;
};
`,
    });
    expect(result.undocumented_items).toMatchObject([{ name: "get", type: "method" }]);
  });

  it('credits a comment above extern "C"', async () => {
    const names = await undocumentedIn(
      "extern-c",
      `/// C entry point.
extern "C" int entry(int argc);
`
    );
    expect(names).toEqual([]);
  });
});

describe("documentationCoverage - C++ member names", () => {
  it("counts constructors, destructors, operators and reference returns", async () => {
    const result = await scan("members", {
      "unit.cpp": `/// A widget.
class Widget {
public:
  Widget();
  ~Widget();
  bool operator==(const Widget& other) const;
  const Widget& self() const;
};

int& counter();
Widget& make() { static Widget w; return w; }
`,
    });
    const items = result.undocumented_items.map((item) => [item.name, item.type]);
    expect(items).toEqual([
      ["Widget", "method"],
      ["~Widget", "method"],
      ["operator==", "method"],
      ["self", "method"],
      ["counter", "function"],
      ["make", "function"],
    ]);
  });

  // fmt's 130-line `class basic_memory_buffer` parses this way, leaving its doc
  // comment above `template` out of reach; the same tree shape is built here.
  it("does not count a record parsed as a function's return type", async () => {
    const names = await undocumentedIn(
      "return-type-record",
      `struct Pair { int a; } makePair(void) { struct Pair p = {1}; return p; }\n`
    );
    expect(names).toEqual(["makePair"]);
  });

  it("does not count a function pointer variable as a function", async () => {
    const names = await undocumentedIn("fnptr", `void (*handler)(int);\n`);
    expect(names).toEqual([]);
  });
});

describe("documentationCoverage - C++ declarations that need no doc comment", () => {
  it("skips explicit specialisations, friends, and defaulted or deleted members", async () => {
    const names = await undocumentedIn(
      "exempt",
      `/// Identity.
template <typename T>
T identity(T x) { return x; }

template <>
int identity<int>(int x) { return x; }

/// A widget.
class Widget {
public:
  /// Builds a widget.
  Widget();
  Widget(const Widget&) = delete;
  Widget& operator=(Widget&&) = default;
  friend void swap(Widget& a, Widget& b);
};
`
    );
    expect(names).toEqual([]);
  });
});

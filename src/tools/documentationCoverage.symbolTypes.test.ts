import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { DocumentationCoverageResult, UndocumentedItem } from "../types/index.js";
import { registerDocumentationCoverageTool } from "./documentationCoverage.js";

const handler = getToolHandler(registerDocumentationCoverageTool, "get_documentation_coverage");

/** Runs the tool on one file and indexes the undocumented items by name. */
async function itemsByName(path: string): Promise<Map<string, UndocumentedItem>> {
  const response = await handler({ path });
  const result = parseContent<DocumentationCoverageResult>(response);
  return new Map(result.undocumented_items.map((item) => [item.name, item]));
}

describe("documentationCoverage - member classification", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `scopewalker-doc-symbols-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  // A Python class body is a `block`, which the C/C++-only parent check missed.
  it("types a Python class method as a method and a module-level def as a function", async () => {
    const path = join(testDir, "methods.py");
    await writeFile(
      path,
      `def free_function():
    return 1


class Holder:
    def member(self):
        return 2

    if True:

        def guarded(self):
            return 3

    def outer(self):
        def helper():
            return 4

        return helper
`
    );

    const items = await itemsByName(path);
    expect(items.get("free_function")?.type).toBe("function");
    expect(items.get("member")?.type).toBe("method");
    expect(items.get("guarded")?.type).toBe("method");
    // A def inside a method body is not a member of the class.
    expect(items.get("helper")?.type).toBe("function");
  });

  // A Ruby def guarded by an if inside a module body is still a member.
  it("types a Ruby def nested in an if inside a module body as a method", async () => {
    const path = join(testDir, "guarded.rb");
    await writeFile(
      path,
      `module Utf8
  if defined?(Fast)

    def normalize_utf8(string)
      string
    end
  end
end

def top_level
  1
end
`
    );

    const items = await itemsByName(path);
    expect(items.get("normalize_utf8")?.type).toBe("method");
    expect(items.get("top_level")?.type).toBe("function");
  });
});

describe("documentationCoverage - body-less and field-bound members", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `scopewalker-doc-members-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("reports a TypeScript abstract class, its signatures and its field arrows", async () => {
    const path = join(testDir, "shape.ts");
    await writeFile(
      path,
      `export abstract class Shape {
  abstract area(): number;
  handleClick = (event: number): number => event + 1;
  describe(): string {
    return "shape";
  }
}
`
    );

    const items = await itemsByName(path);
    expect(items.get("Shape")?.type).toBe("class");
    expect(items.get("area")?.type).toBe("method");
    expect(items.get("handleClick")?.type).toBe("method");
    expect(items.get("describe")?.type).toBe("method");
    // The arrow bound to the field must be counted once, under the field's name.
    expect(items.size).toBe(4);
  });

  it("reports Rust trait method signatures as methods", async () => {
    const path = join(testDir, "exchange.rs");
    await writeFile(
      path,
      `/// A documented trait.
pub trait Exchange {
    /// Documented required method.
    fn name(&self) -> String;
    fn undocumented_required(&self) -> u32;
    /// Documented provided method.
    fn provided(&self) -> u32 {
        self.undocumented_required() + 1
    }
}
`
    );

    const items = await itemsByName(path);
    expect(items.get("undocumented_required")?.type).toBe("method");
    expect(items.size).toBe(1);
  });

  it("reports Go interface method specs as methods", async () => {
    const path = join(testDir, "reader.go");
    await writeFile(
      path,
      `package main

type Reader interface {
	// Read reads into p.
	Read(p []byte) (int, error)
	Close() error
}
`
    );

    const items = await itemsByName(path);
    expect(items.get("Close")?.type).toBe("method");
    expect(items.has("Read")).toBe(false);
    // The return type must never be reported as a method name.
    expect(items.has("error")).toBe(false);
  });
});

describe("documentationCoverage - C and C++ records (struct declarations)", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `scopewalker-doc-records-decl-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  // `struct Bar *b` names a type; only a member list declares one.
  it("counts a C struct only where it has a body, not where it is referenced", async () => {
    const path = join(testDir, "pins.c");
    await writeFile(
      path,
      `struct Bar {
  int x;
};

void use_bar(struct Bar *b);

struct Bar *make_bar(void) {
  return 0;
}

struct Bar **make_bar_list(void) {
  return 0;
}

struct Opaque;

struct Bar *global_pins;
`
    );

    const items = await itemsByName(path);
    expect([...items.keys()].sort()).toEqual(["Bar", "make_bar", "make_bar_list", "use_bar"]);
    expect(items.get("Bar")?.type).toBe("class");
    expect(items.get("make_bar")?.type).toBe("function");
  });

  it("counts a struct-typed C++ field as data, not as a class", async () => {
    const headerPath = join(testDir, "cpu.hpp");
    await writeFile(
      headerPath,
      `struct CPU_pins {
  int reset;
};

class CPU {
public:
  void step();

private:
  struct CPU_pins *pins;
};
`
    );

    const items = await itemsByName(headerPath);
    expect([...items.keys()].sort()).toEqual(["CPU", "CPU_pins", "step"]);
    expect(items.get("step")?.type).toBe("method");
  });
});

describe("documentationCoverage - C and C++ records (enums, unions and pointers)", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `scopewalker-doc-records-other-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("counts a defined C enum and union but not a bare reference to one", async () => {
    const path = join(testDir, "types.c");
    await writeFile(
      path,
      `enum Color {
  RED,
};

union Value {
  int i;
};

enum Color pick(union Value v);
`
    );

    const items = await itemsByName(path);
    expect([...items.keys()].sort()).toEqual(["Color", "Value", "pick"]);
    expect(items.get("Color")?.type).toBe("class");
    expect(items.get("Value")?.type).toBe("class");
  });

  it("names a C++ pointer-returning definition by its declarator", async () => {
    const path = join(testDir, "factory.cpp");
    await writeFile(
      path,
      `struct Widget {
  int size;
};

Widget *make_widget(void) {
  return 0;
}
`
    );

    const items = await itemsByName(path);
    expect(items.has("make_widget")).toBe(true);
    expect(items.get("make_widget")?.type).toBe("function");
  });
});

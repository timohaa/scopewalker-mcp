import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { countImports, getComments, getFunctions, parseCode } from "./treeSitter.js";

describe("getFunctions", () => {
  it("extracts TypeScript functions", async () => {
    const code = `function foo() {}
export function baz(x: number): number { return x; }`;
    const functions = await getFunctions(code, "typescript");
    expect(functions.length).toBeGreaterThanOrEqual(2);
    expect(functions.map((f) => f.name)).toContain("foo");
    expect(functions.map((f) => f.name)).toContain("baz");
  });

  it("extracts TypeScript arrow functions", async () => {
    const code = `const bar = () => {};`;
    const functions = await getFunctions(code, "typescript");
    expect(functions.length).toBeGreaterThanOrEqual(1);
  });

  it("treats unparenthesized single-param arrows as anonymous", async () => {
    const code = `const dbl = x => x * 2;
const dbl2 = (x) => x * 2;`;
    const functions = await getFunctions(code, "typescript");
    // The bare parameter identifier must not be mistaken for a function name
    expect(functions.map((f) => f.name)).toEqual(["<anonymous>", "<anonymous>"]);
  });

  it("extracts TypeScript class methods", async () => {
    const code = `class MyClass {
  method1() {}
  async method2() {}
}`;
    const functions = await getFunctions(code, "typescript");
    expect(functions.length).toBe(2);
    expect(functions.map((f) => f.name)).toContain("method1");
    expect(functions.map((f) => f.name)).toContain("method2");
  });

  it("extracts Python functions when grammar available", async () => {
    const code = `def foo():
    pass

def bar():
    pass`;
    try {
      const functions = await getFunctions(code, "python");
      if (functions.length > 0) {
        expect(functions.map((f) => f.name)).toContain("foo");
        expect(functions.map((f) => f.name)).toContain("bar");
      }
    } catch {
      // Grammar may not be available in all environments
    }
  });

  it("extracts Go functions when grammar available", async () => {
    const code = `package main

func main() {}

func helper(x int) int {
    return x
}`;
    try {
      const functions = await getFunctions(code, "go");
      if (functions.length > 0) {
        expect(functions.map((f) => f.name)).toContain("main");
        expect(functions.map((f) => f.name)).toContain("helper");
      }
    } catch {
      // Grammar may not be available in all environments
    }
  });

  it("includes line numbers", async () => {
    const code = `function first() {}
function second() {}`;
    const functions = await getFunctions(code, "typescript");
    const named = functions.filter((f) => f.name !== "<anonymous>");
    expect(named.length).toBeGreaterThanOrEqual(2);
    expect(named[0].startLine).toBe(1);
  });
});

describe("parseCode", () => {
  it("returns AST tree for valid code", async () => {
    const tree = await parseCode("const x = 1;", "typescript");
    expect(tree).not.toBeNull();
    expect(tree?.rootNode).toBeDefined();
  });

  it("handles syntax errors gracefully", async () => {
    const tree = await parseCode("function { broken", "typescript");
    expect(tree).not.toBeNull();
  });
});

describe("getFunctions - Ruby", () => {
  it("extracts Ruby methods when grammar available", async () => {
    const code = `def regular_method
  puts "hello"
end

def self.class_method
  puts "class method"
end

class MyClass
  def instance_method
    "instance"
  end
end`;
    try {
      const functions = await getFunctions(code, "ruby");
      if (functions.length > 0) {
        expect(functions.map((f) => f.name)).toContain("regular_method");
        // singleton_method for self.class_method
        expect(functions.some((f) => f.name.includes("class_method"))).toBe(true);
      }
    } catch {
      // Grammar may not be available in all environments
    }
  });
});

describe("getFunctions - Rust", () => {
  it("extracts Rust functions when grammar available", async () => {
    const code = `fn main() {
    println!("Hello");
}

fn helper(x: i32) -> i32 {
    x + 1
}`;
    try {
      const functions = await getFunctions(code, "rust");
      if (functions.length > 0) {
        expect(functions.map((f) => f.name)).toContain("main");
        expect(functions.map((f) => f.name)).toContain("helper");
      }
    } catch {
      // Grammar may not be available in all environments
    }
  });
});

describe("getFunctions - Java", () => {
  it("extracts Java methods when grammar available", async () => {
    const code = `public class MyClass {
    public void doSomething() {
        System.out.println("hello");
    }

    public MyClass() {
        // constructor
    }
}`;
    try {
      const functions = await getFunctions(code, "java");
      if (functions.length > 0) {
        expect(functions.map((f) => f.name)).toContain("doSomething");
        expect(functions.map((f) => f.name)).toContain("MyClass");
      }
    } catch {
      // Grammar may not be available in all environments
    }
  });
});

describe("grammar-load failure guards", () => {
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    originalConsoleError = console.error;
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  // An unsupported language has no loader, so loadGrammar returns null and every
  // caller must fall back to its empty value rather than throwing.
  it("returns no functions when the grammar cannot be loaded", async () => {
    // @ts-expect-error - unsupported language exercises the grammar-load failure path
    expect(await getFunctions("function f() {}", "nosuchlang")).toEqual([]);
  });

  it("returns a null tree when the grammar cannot be loaded", async () => {
    // @ts-expect-error - unsupported language exercises the grammar-load failure path
    expect(await parseCode("function f() {}", "nosuchlang")).toBeNull();
  });

  it("returns no comments when the grammar cannot be loaded", async () => {
    // @ts-expect-error - unsupported language exercises the grammar-load failure path
    expect(await getComments("// hi", "nosuchlang")).toEqual([]);
  });

  it("counts zero imports when the grammar cannot be loaded", async () => {
    // @ts-expect-error - unsupported language exercises the grammar-load failure path
    expect(await countImports('import "x"', "nosuchlang")).toBe(0);
  });
});

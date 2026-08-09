import type Parser from "tree-sitter";
import { describe, expect, it } from "vitest";
import { parseCode } from "../lib/treeSitter.js";
import type { SupportedLanguage } from "../types/index.js";
import { countParameters } from "./complexityMetricsParameters.js";

/**
 * Characterization tests pinning countParameters' per-grammar arity rules.
 *
 * The tool-level suites only assert file-wide max_parameters, which cannot
 * distinguish "counted the receiver" from "counted a splat". These call the
 * function directly so a refactor that changes one grammar's rule fails here.
 */

/** Parses code and returns the first node of the given type. */
async function nodeOfType(
  code: string,
  language: SupportedLanguage,
  nodeType: string
): Promise<Parser.SyntaxNode> {
  const tree = await parseCode(code, language);
  if (tree === null) throw new Error(`Failed to parse ${language}`);

  function find(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    if (node.type === nodeType) return node;
    for (const child of node.children) {
      const found = find(child);
      if (found !== null) return found;
    }
    return null;
  }

  const result = find(tree.rootNode);
  if (result === null) throw new Error(`No ${nodeType} in ${language} source`);
  return result;
}

describe("countParameters - non-function nodes", () => {
  it("returns null for a node that is not a function", async () => {
    const node = await nodeOfType(`const x = 1;`, "typescript", "variable_declarator");
    expect(countParameters(node, "typescript")).toBeNull();
  });
});

describe("countParameters - Python receiver and splat rules", () => {
  it("skips self as the first parameter", async () => {
    const fn = await nodeOfType(`def m(self, a, b):\n    pass`, "python", "function_definition");
    expect(countParameters(fn, "python")).toBe(2);
  });

  it("skips cls as the first parameter", async () => {
    const fn = await nodeOfType(`def m(cls, a):\n    pass`, "python", "function_definition");
    expect(countParameters(fn, "python")).toBe(1);
  });

  it("counts self when it is not first", async () => {
    const fn = await nodeOfType(`def m(a, self):\n    pass`, "python", "function_definition");
    expect(countParameters(fn, "python")).toBe(2);
  });

  it("excludes *args and **kwargs", async () => {
    const fn = await nodeOfType(
      `def m(a, *args, **kwargs):\n    pass`,
      "python",
      "function_definition"
    );
    expect(countParameters(fn, "python")).toBe(1);
  });

  it("excludes the bare * keyword-only separator", async () => {
    const fn = await nodeOfType(`def m(a, *, b):\n    pass`, "python", "function_definition");
    expect(countParameters(fn, "python")).toBe(2);
  });

  it("does not treat a parameter after a skipped splat as the receiver", async () => {
    // Regression guard for the unconditional isFirst reset: `self` here follows
    // *args, so it is a real parameter and must not be dropped as a receiver.
    const fn = await nodeOfType(`def m(*args, self):\n    pass`, "python", "function_definition");
    expect(countParameters(fn, "python")).toBe(1);
  });

  it("counts typed and defaulted parameters", async () => {
    const fn = await nodeOfType(
      `def m(a: int, b: str = "x", c=3):\n    pass`,
      "python",
      "function_definition"
    );
    expect(countParameters(fn, "python")).toBe(3);
  });
});

describe("countParameters - Go grouped and unnamed parameters", () => {
  it("expands a grouped declaration into one count per name", async () => {
    const fn = await nodeOfType(`func f(a, b, c int) {}`, "go", "function_declaration");
    expect(countParameters(fn, "go")).toBe(3);
  });

  it("counts an unnamed parameter as one", async () => {
    const fn = await nodeOfType(`func f(int, string) {}`, "go", "function_declaration");
    expect(countParameters(fn, "go")).toBe(2);
  });

  it("ignores the receiver on a method declaration", async () => {
    // The receiver is its own parameter_list; the named `parameters` field is
    // what keeps a positional scan from matching it first.
    const fn = await nodeOfType(`func (p *Point) Move(dx, dy int) {}`, "go", "method_declaration");
    expect(countParameters(fn, "go")).toBe(2);
  });

  it("returns 0 for a parameterless function", async () => {
    const fn = await nodeOfType(`func f() {}`, "go", "function_declaration");
    expect(countParameters(fn, "go")).toBe(0);
  });
});

describe("countParameters - remaining grammars", () => {
  it("counts TypeScript required and optional parameters", async () => {
    const fn = await nodeOfType(
      `function f(a: string, b?: number, ...rest: unknown[]): void {}`,
      "typescript",
      "function_declaration"
    );
    expect(countParameters(fn, "typescript")).toBe(3);
  });

  it("counts an unparenthesized single-parameter arrow", async () => {
    const fn = await nodeOfType(`const f = x => x + 1;`, "javascript", "arrow_function");
    expect(countParameters(fn, "javascript")).toBe(1);
  });

  it("counts a parenthesized zero-parameter arrow", async () => {
    const fn = await nodeOfType(`const f = () => 1;`, "javascript", "arrow_function");
    expect(countParameters(fn, "javascript")).toBe(0);
  });

  it("counts Rust parameters excluding the self receiver node", async () => {
    const fn = await nodeOfType(
      `impl S { fn m(&self, a: u32, b: u32) -> u32 { a } }`,
      "rust",
      "function_item"
    );
    expect(countParameters(fn, "rust")).toBe(3);
  });

  it("counts Java method parameters", async () => {
    const fn = await nodeOfType(
      `class C { void m(String a, int b) {} }`,
      "java",
      "method_declaration"
    );
    expect(countParameters(fn, "java")).toBe(2);
  });

  it("counts C parameters nested inside the function declarator", async () => {
    const fn = await nodeOfType(`int f(int a, char *b) { return a; }`, "c", "function_definition");
    expect(countParameters(fn, "c")).toBe(2);
  });

  it("counts C++ parameters behind a pointer return type", async () => {
    const fn = await nodeOfType(
      `void *alloc(int size, int flags) { return 0; }`,
      "cpp",
      "function_definition"
    );
    expect(countParameters(fn, "cpp")).toBe(2);
  });

  it("counts Ruby method parameters", async () => {
    const fn = await nodeOfType(`def m(a, b)\n  a\nend`, "ruby", "method");
    expect(countParameters(fn, "ruby")).toBe(2);
  });
});

import type Parser from "tree-sitter";
import { describe, expect, it } from "vitest";
import { parseCode } from "../lib/treeSitter.js";
import type { SupportedLanguage } from "../types/index.js";
import { extractParameterNames } from "./propDrillingParamNames.js";

/**
 * Per-grammar branch coverage for extractParameterNames.
 *
 * propDrillingHelpers.test.ts covers the common TS/Python/Go/Java/Rust shapes;
 * these cover the branches it leaves untested — Python splats, the C/C++/Ruby
 * node types, and the identifier-scan fallback.
 *
 * Several are regression guards for defects where this module's private copy of
 * the parameter-list lookup had drifted from the one in complexityMetrics: Go
 * methods yielded their receiver, and C/C++ yielded nothing at all. Both now
 * share src/lib/parameterList.ts.
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

describe("extractParameterNames - Python splats and receivers", () => {
  it("omits *args and **kwargs", async () => {
    const fn = await nodeOfType(
      `def m(a, *args, **kwargs):\n    pass`,
      "python",
      "function_definition"
    );
    expect(extractParameterNames(fn, "python")).toEqual(["a"]);
  });

  it("omits the bare * keyword-only separator but keeps what follows", async () => {
    const fn = await nodeOfType(`def m(a, *, b):\n    pass`, "python", "function_definition");
    expect(extractParameterNames(fn, "python")).toEqual(["a", "b"]);
  });

  it("omits cls as the first parameter", async () => {
    const fn = await nodeOfType(`def m(cls, a):\n    pass`, "python", "function_definition");
    expect(extractParameterNames(fn, "python")).toEqual(["a"]);
  });

  it("keeps self when it is not the first parameter", async () => {
    const fn = await nodeOfType(`def m(a, self):\n    pass`, "python", "function_definition");
    expect(extractParameterNames(fn, "python")).toEqual(["a", "self"]);
  });

  it("keeps a self that follows a skipped splat", async () => {
    // Only the very first child can be the receiver, so `self` after *args is a
    // real parameter. Regression guard: the receiver flag must clear on skipped
    // children too.
    const fn = await nodeOfType(`def m(*args, self):\n    pass`, "python", "function_definition");
    expect(extractParameterNames(fn, "python")).toEqual(["self"]);
  });
});

describe("extractParameterNames - C, C++ and Ruby", () => {
  // C/C++ nest parameter_list inside function_declarator, and one declarator per
  // level of indirection, so both the list lookup and the name lookup have to
  // recurse. These previously returned [] for every C/C++ function.
  it("extracts C parameter names from declarators", async () => {
    const fn = await nodeOfType(`int f(int a, char *b) { return a; }`, "c", "function_definition");
    expect(extractParameterNames(fn, "c")).toEqual(["a", "b"]);
  });

  it("extracts C names through nested pointer declarators", async () => {
    const fn = await nodeOfType(`void g(int x, int *y, char **z) {}`, "c", "function_definition");
    expect(extractParameterNames(fn, "c")).toEqual(["x", "y", "z"]);
  });

  it("extracts C array and function-pointer parameter names", async () => {
    const arrayFn = await nodeOfType(`void h(int arr[], int n) {}`, "c", "function_definition");
    expect(extractParameterNames(arrayFn, "c")).toEqual(["arr", "n"]);

    const cbFn = await nodeOfType(`void k(void (*cb)(int), int n) {}`, "c", "function_definition");
    expect(extractParameterNames(cbFn, "c")).toEqual(["cb", "n"]);
  });

  it("extracts C++ parameter names", async () => {
    const fn = await nodeOfType(
      `int add(int left, int right) { return left + right; }`,
      "cpp",
      "function_definition"
    );
    expect(extractParameterNames(fn, "cpp")).toEqual(["left", "right"]);
  });

  it("extracts C++ reference and double-pointer parameter names", async () => {
    const fn = await nodeOfType(
      `void m(const std::string &s, int **pp) {}`,
      "cpp",
      "function_definition"
    );
    expect(extractParameterNames(fn, "cpp")).toEqual(["s", "pp"]);
  });

  it("extracts Ruby method parameter names", async () => {
    const fn = await nodeOfType(`def m(a, b)\n  a\nend`, "ruby", "method");
    expect(extractParameterNames(fn, "ruby")).toEqual(["a", "b"]);
  });
});

describe("extractParameterNames - Go receiver disambiguation", () => {
  it("extracts a Go method's parameters, not its receiver", async () => {
    // A method_declaration carries two parameter_list children: the receiver
    // comes first positionally, so only the named `parameters` field separates
    // them. This previously returned ["p"].
    const fn = await nodeOfType(
      `package m\nfunc (p *Point) Move(dx, dy int) {}`,
      "go",
      "method_declaration"
    );
    expect(extractParameterNames(fn, "go")).toEqual(["dx", "dy"]);
  });

  it("still extracts a Go free function's parameters", async () => {
    const fn = await nodeOfType(`package m\nfunc Free(a, b int) {}`, "go", "function_declaration");
    expect(extractParameterNames(fn, "go")).toEqual(["a", "b"]);
  });
});

describe("extractParameterNames - no parameter list", () => {
  it("returns an empty array when the function has no parameter list node", async () => {
    const fn = await nodeOfType(`const f = x => x;`, "typescript", "arrow_function");
    expect(extractParameterNames(fn, "typescript")).toEqual([]);
  });
});

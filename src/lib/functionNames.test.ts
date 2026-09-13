import type Parser from "tree-sitter";
import { describe, expect, it } from "vitest";
import type { SupportedLanguage } from "../types/index.js";
import { extractFunctionName } from "./functionNames.js";
import { parseCode } from "./treeSitter.js";

/**
 * Branch coverage for the shared name extractor.
 *
 * The tool-level regressions live in src/tools/functions.names.test.ts and
 * functions.arrowNames.test.ts; these cover the declarator shapes and binding
 * forms that no ordinary source file produces.
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

describe("extractFunctionName - C declarators", () => {
  it("finds no name in an abstract declarator", async () => {
    // `(*)` declares no name at all; the grammar fills the gap with a zero-width
    // identifier, which must not become an empty function name.
    const fn = await nodeOfType(`int (*)(void) { return 0; }`, "c", "function_definition");
    expect(extractFunctionName(fn)).toBeNull();
  });

  it("reads through an attribute after the declarator", async () => {
    const fn = await nodeOfType(
      `void f(void) __attribute__((noreturn)) { }`,
      "c",
      "function_definition"
    );
    expect(extractFunctionName(fn)).toBe("f");
  });

  it("reads a K&R definition", async () => {
    const fn = await nodeOfType(
      `int main(argc, argv) int argc; char **argv; { return 0; }`,
      "c",
      "function_definition"
    );
    expect(extractFunctionName(fn)).toBe("main");
  });
});

describe("extractFunctionName - bindings that name nothing", () => {
  it("finds no name for a destructured binding", async () => {
    const fn = await nodeOfType(`const [f] = [() => 1];`, "typescript", "arrow_function");
    expect(extractFunctionName(fn)).toBeNull();
  });

  it("finds no name for a string-keyed object property", async () => {
    const fn = await nodeOfType(`const o = { "run": () => 1 };`, "typescript", "arrow_function");
    expect(extractFunctionName(fn)).toBeNull();
  });

  it("finds no name when assigned to a subscript", async () => {
    const fn = await nodeOfType(`handlers[key] = () => 1;`, "typescript", "arrow_function");
    expect(extractFunctionName(fn)).toBeNull();
  });

  it("names a plain assignment to an identifier", async () => {
    const fn = await nodeOfType(`handler = () => 1;`, "typescript", "arrow_function");
    expect(extractFunctionName(fn)).toBe("handler");
  });
});

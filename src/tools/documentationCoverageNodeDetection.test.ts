import type Parser from "tree-sitter";
import { describe, expect, it } from "vitest";
import { parseCode } from "../lib/treeSitter.js";
import type { SupportedLanguage } from "../types/index.js";
import { hasDocumentation } from "./documentationCoverageAnalysis.js";
import { getDocumentableNode } from "./documentationCoverageNodeDetection.js";

/**
 * Characterization tests for documentable-node classification and doc lookup.
 *
 * The existing coverage for these is tool-level, which only sees aggregate
 * documented/undocumented counts. These pin each classification branch —
 * especially the parent-context rules for Ruby defs and C/C++ record members —
 * so splitting getDocumentableType cannot quietly reclassify a node type.
 */

/** Parses code and collects every documentable node, keyed by name. */
async function documentablesOf(
  code: string,
  language: SupportedLanguage
): Promise<Record<string, { type: string; lineCount: number }>> {
  const tree = await parseCode(code, language);
  if (tree === null) throw new Error(`Failed to parse ${language}`);

  const found: Record<string, { type: string; lineCount: number }> = {};

  function walk(node: Parser.SyntaxNode): void {
    const doc = getDocumentableNode(node);
    if (doc !== null) found[doc.name] = { type: doc.type, lineCount: doc.lineCount };
    for (const child of node.children) walk(child);
  }

  walk(tree.rootNode);
  return found;
}

/** Parses code and returns whether the first node of the given type is documented. */
async function isDocumented(
  code: string,
  language: SupportedLanguage,
  nodeType: string
): Promise<boolean> {
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

  const target = find(tree.rootNode);
  if (target === null) throw new Error(`No ${nodeType} in ${language} source`);
  return hasDocumentation(target, code.split("\n"), language);
}

describe("getDocumentableNode - classification by node type", () => {
  it("classifies a TypeScript function and class", async () => {
    const found = await documentablesOf(`class Widget {}\nfunction build() {}`, "typescript");
    expect(found.Widget.type).toBe("class");
    expect(found.build.type).toBe("function");
  });

  it("classifies a TypeScript class method as method", async () => {
    const found = await documentablesOf(`class W { resize() {} }`, "typescript");
    expect(found.resize.type).toBe("method");
  });

  it("classifies a named arrow function as function", async () => {
    const found = await documentablesOf(`const build = () => {};`, "typescript");
    expect(found.build.type).toBe("function");
  });

  it("ignores an inline callback arrow", async () => {
    const found = await documentablesOf(`items.map(item => item.id);`, "typescript");
    expect(Object.keys(found)).toHaveLength(0);
  });

  it("reports lineCount spanning the whole declaration", async () => {
    const found = await documentablesOf(`function f() {\n  return 1;\n}`, "typescript");
    expect(found.f.lineCount).toBe(3);
  });
});

describe("getDocumentableNode - parent-context rules", () => {
  it("classifies a Ruby module-level def as function and a class member as method", async () => {
    const found = await documentablesOf(
      `def free_fn\n  1\nend\n\nclass C\n  def member\n    2\n  end\nend`,
      "ruby"
    );
    expect(found.free_fn.type).toBe("function");
    expect(found.member.type).toBe("method");
  });

  it("classifies a C++ in-class member as method and a free function as function", async () => {
    const found = await documentablesOf(
      `class Point {\n  void reset() {}\n};\nint main() { return 0; }`,
      "cpp"
    );
    expect(found.reset.type).toBe("method");
    expect(found.main.type).toBe("function");
  });

  it("classifies a C header prototype as function", async () => {
    const found = await documentablesOf(`int compute(int a);`, "c");
    expect(found.compute.type).toBe("function");
  });

  it("classifies a C++ struct as class", async () => {
    const found = await documentablesOf(`struct Pair { int a; };`, "cpp");
    expect(found.Pair.type).toBe("class");
  });

  it("classifies a Go method declaration as method", async () => {
    const found = await documentablesOf(
      `package m\nfunc (p *Point) Move() {}\nfunc Free() {}`,
      "go"
    );
    expect(found.Move.type).toBe("method");
    expect(found.Free.type).toBe("function");
  });
});

describe("hasDocumentation - sibling and lookback scanning", () => {
  it("finds a JSDoc block directly above a function", async () => {
    const code = `/** Builds it. */\nfunction build() {}`;
    expect(await isDocumented(code, "typescript", "function_declaration")).toBe(true);
  });

  it("reports undocumented when only a plain line comment precedes", async () => {
    const code = `// just a note\nfunction build() {}`;
    expect(await isDocumented(code, "typescript", "function_declaration")).toBe(false);
  });

  it("finds a doc comment separated by a blank line", async () => {
    const code = `/** Builds it. */\n\nfunction build() {}`;
    expect(await isDocumented(code, "typescript", "function_declaration")).toBe(true);
  });

  it("looks past a decorator between the doc comment and the declaration", async () => {
    const code = `class C {\n  /** Runs it. */\n  @log()\n  run() {}\n}`;
    expect(await isDocumented(code, "typescript", "method_definition")).toBe(true);
  });

  it("finds a multi-line JSDoc block", async () => {
    const code = `/**\n * Builds it.\n * @returns nothing\n */\nfunction build() {}`;
    expect(await isDocumented(code, "typescript", "function_declaration")).toBe(true);
  });

  it("reports undocumented when nothing precedes the declaration", async () => {
    expect(await isDocumented(`function build() {}`, "typescript", "function_declaration")).toBe(
      false
    );
  });

  it("finds a Python docstring inside the function body", async () => {
    const code = `def build():\n    """Builds it."""\n    pass`;
    expect(await isDocumented(code, "python", "function_definition")).toBe(true);
  });

  it("does not accept a Python # comment as documentation", async () => {
    // Deliberate: isDocComment requires a docstring for Python, matching the
    // language convention. A leading # comment is not documentation.
    const code = `# Builds it.\ndef build():\n    pass`;
    expect(await isDocumented(code, "python", "function_definition")).toBe(false);
  });

  it("finds a Go doc comment above the function", async () => {
    const code = `package m\n\n// Build builds it.\nfunc Build() {}`;
    expect(await isDocumented(code, "go", "function_declaration")).toBe(true);
  });

  it("finds a Rust /// doc comment", async () => {
    const code = `/// Builds it.\nfn build() {}`;
    expect(await isDocumented(code, "rust", "function_item")).toBe(true);
  });
});

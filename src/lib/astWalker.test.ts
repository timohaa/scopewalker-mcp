import type Parser from "tree-sitter";
import { describe, it, expect } from "vitest";
import { walkNode, MAX_WALK_DEPTH } from "./astWalker.js";
import { parseCode } from "./treeSitter.js";

/** Returns the nodes along the first-named-child chain, starting at root. */
function firstChildChain(root: Parser.SyntaxNode): Parser.SyntaxNode[] {
  const chain: Parser.SyntaxNode[] = [];
  for (let node: Parser.SyntaxNode | null = root; node !== null; node = node.namedChild(0)) {
    chain.push(node);
  }
  return chain;
}

/** Parses JavaScript with `depth` nested empty arrays and returns the root node. */
async function parseNestedArrays(depth: number): Promise<Parser.SyntaxNode> {
  const tree = await parseCode(`${"[".repeat(depth)}${"]".repeat(depth)};`, "javascript");
  if (tree === null) {
    throw new Error("javascript grammar failed to load");
  }
  return tree.rootNode;
}

describe("walkNode", () => {
  it("truncates recursion at MAX_WALK_DEPTH instead of overflowing the stack", async () => {
    const root = await parseNestedArrays(MAX_WALK_DEPTH + 50);
    const visited = new Set<number>();
    expect(() => {
      walkNode(root, (node) => {
        visited.add(node.id);
      });
    }).not.toThrow();
    const chain = firstChildChain(root);
    expect(chain.length).toBeGreaterThan(MAX_WALK_DEPTH + 1);
    const firstUnvisited = chain.findIndex((node) => !visited.has(node.id));
    expect(firstUnvisited).toBe(MAX_WALK_DEPTH + 1);
  });

  it("visits every node in a shallow tree", async () => {
    const root = await parseNestedArrays(2);
    let calls = 0;
    walkNode(root, () => {
      calls++;
    });
    // program, expression_statement, two arrays with brackets each, and the semicolon
    expect(calls).toBe(9);
  });
});

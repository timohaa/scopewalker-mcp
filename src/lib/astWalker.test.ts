import type Parser from "tree-sitter";
import { describe, it, expect } from "vitest";
import { walkNode, MAX_WALK_DEPTH } from "./astWalker.js";

interface FakeNode {
  children: FakeNode[];
}

function buildChain(depth: number): FakeNode {
  const root: FakeNode = { children: [] };
  let current = root;
  for (let i = 0; i < depth; i++) {
    const child: FakeNode = { children: [] };
    current.children.push(child);
    current = child;
  }
  return root;
}

describe("walkNode", () => {
  it("truncates recursion at MAX_WALK_DEPTH instead of overflowing the stack", () => {
    const chain = buildChain(MAX_WALK_DEPTH + 50);
    let calls = 0;
    expect(() => {
      walkNode(chain as unknown as Parser.SyntaxNode, () => {
        calls++;
      });
    }).not.toThrow();
    expect(calls).toBe(MAX_WALK_DEPTH + 1);
  });

  it("visits every node in a shallow tree", () => {
    const chain = buildChain(2);
    let calls = 0;
    walkNode(chain as unknown as Parser.SyntaxNode, () => {
      calls++;
    });
    expect(calls).toBe(3);
  });
});

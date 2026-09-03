import type Parser from "tree-sitter";

// Real code rarely nests past ~50 levels, so anything deeper is treated as
// adversarial and truncated rather than risking a stack overflow.
export const MAX_WALK_DEPTH = 500;

/** Recursively traverses AST nodes, invoking callback on each. */
export function walkNode(
  node: Parser.SyntaxNode,
  callback: (node: Parser.SyntaxNode) => void,
  depth = 0
): void {
  if (depth > MAX_WALK_DEPTH) {
    return;
  }
  callback(node);
  for (const child of node.children) {
    walkNode(child, callback, depth + 1);
  }
}

import type Parser from "tree-sitter";

// Maximum recursion depth before AST traversal stops to avoid a stack overflow.
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

import type Parser from "tree-sitter";

/** Recursively traverses AST nodes, invoking callback on each. */
export function walkNode(
  node: Parser.SyntaxNode,
  callback: (node: Parser.SyntaxNode) => void
): void {
  callback(node);
  for (const child of node.children) {
    walkNode(child, callback);
  }
}

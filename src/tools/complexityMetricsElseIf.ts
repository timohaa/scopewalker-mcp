import type Parser from "tree-sitter";

/**
 * Checks if an if node is part of an "else if" chain.
 * In tree-sitter, "else if" is represented as:
 *   if_statement
 *     ├── else (keyword)
 *     └── if_statement (sibling - this is the "else if")
 * So we check if the if node has a previous sibling that is an 'else' keyword.
 * Rust wraps the pair in an else_clause and calls the node if_expression, but the
 * else-keyword sibling holds there too, so both type names qualify.
 */
export function isElseIf(node: Parser.SyntaxNode): boolean {
  if (node.type !== "if_statement" && node.type !== "if_expression") return false;

  // Compare via previousSibling rather than locating the node in parent.children:
  // tree-sitter hands out fresh SyntaxNode wrappers per access, so indexOf's
  // reference equality silently misses and the chain reads as real nesting.
  return node.previousSibling?.type === "else";
}

/**
 * Checks if a node is any grammar's spelling of an else-if branch.
 *
 * Cognitive complexity treats these as flat sibling branches rather than nesting;
 * cyclomatic complexity must NOT use this, because an else-if is a genuine
 * predicate with its own edge and McCabe counts it like any other decision.
 */
export function isElseIfBranch(node: Parser.SyntaxNode): boolean {
  // Python and Ruby give the branch its own node type, so it is an else-if by
  // construction and needs no previous-sibling check.
  if (node.type === "elif_clause" || node.type === "elsif") return true;
  return isElseIf(node);
}

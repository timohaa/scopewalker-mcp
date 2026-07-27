import type Parser from "tree-sitter";
import type { SupportedLanguage } from "../types/index.js";

/** Languages that use JSDoc-style comment syntax. */
export const JSDOC_LANGUAGES: SupportedLanguage[] = [
  "typescript",
  "javascript",
  "java",
  "c",
  "cpp",
];

/** Checks if a node is a comment type in tree-sitter. */
export function isCommentNode(node: Parser.SyntaxNode): boolean {
  return node.type === "comment" || node.type === "line_comment" || node.type === "block_comment";
}

/**
 * Checks if a Python function/class has a docstring as the first statement in its body.
 * Python docstrings are string literals that appear as the first statement in a function,
 * class, or module body.
 */
export function hasPythonDocstring(node: Parser.SyntaxNode): boolean {
  const block = node.children.find((child) => child.type === "block");
  if (!block) return false;

  if (block.namedChildren.length === 0) return false;
  const firstStatement = block.namedChildren[0];
  if (firstStatement.type !== "expression_statement") {
    return false;
  }

  if (firstStatement.namedChildren.length === 0) return false;
  const stringNode = firstStatement.namedChildren[0];
  if (stringNode.type !== "string") {
    return false;
  }

  return true;
}

/** Checks if a line starts a doc comment based on language conventions. */
export function isDocComment(line: string, language: SupportedLanguage): boolean {
  if (JSDOC_LANGUAGES.includes(language)) {
    // Require the JSDoc opener; plain /* ... */ block comments (e.g. eslint-disable)
    // are not documentation. Continuation lines (*, */) are handled by the caller
    // scanning upward through comment lines to the opening line.
    return line.startsWith("/**");
  }
  if (language === "python") return line.startsWith('"""') || line.startsWith("'''");
  if (language === "rust") return line.startsWith("///") || line.startsWith("//!");
  if (language === "go") return line.startsWith("//");
  if (language === "ruby") return line.startsWith("#");
  return line.startsWith("/**") || line.startsWith("///");
}

/** Checks if comment text represents a doc comment (for AST comment nodes). */
export function isDocCommentText(text: string, language: SupportedLanguage): boolean {
  if (JSDOC_LANGUAGES.includes(language)) return text.startsWith("/**");
  if (language === "python") return text.startsWith('"""') || text.startsWith("'''");
  if (language === "rust") return text.startsWith("///") || text.startsWith("//!");
  return text.startsWith("/**");
}

/** Returns true if line starts with any comment syntax. */
export function isAnyComment(line: string): boolean {
  return (
    line.startsWith("//") ||
    line.startsWith("#") ||
    line.startsWith("*") ||
    line.startsWith("/*") ||
    line.startsWith('"""') ||
    line.startsWith("'''")
  );
}

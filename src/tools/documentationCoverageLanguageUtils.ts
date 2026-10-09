import type Parser from "tree-sitter";
import type { SupportedLanguage } from "../types/index.js";

/** Languages that use JSDoc-style comment syntax. */
export const JSDOC_LANGUAGES: SupportedLanguage[] = ["typescript", "javascript", "java"];

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

  const firstStatement = block.namedChildren[0];
  if (firstStatement?.type !== "expression_statement") {
    return false;
  }

  const stringNode = firstStatement.namedChildren[0];
  if (stringNode?.type !== "string") {
    return false;
  }

  return true;
}

/**
 * Checks if Rust comment text documents the item that follows it.
 * `//!` and `/*!` are inner doc comments: they document the module or crate
 * they sit inside, never the next item.
 */
function isRustDocComment(text: string): boolean {
  return text.startsWith("///") || text.startsWith("/**");
}

/** True for C and C++, which share Doxygen comments and declarator syntax. */
export function isCFamily(language: SupportedLanguage): boolean {
  return language === "c" || language === "cpp";
}

/** Doxygen openers that document the declaration below them. */
const C_FAMILY_DOC_OPENERS = ["/**", "/*!", "///", "//!"];

/**
 * Doxygen forms that document the member before them (`int x; ///< ...`).
 * They must never be credited to the declaration that follows.
 */
export const C_FAMILY_TRAILING_DOC = /^(?:\/\/[/!]|\/\*[*!])</;

/**
 * Checks if C/C++ comment text documents the declaration that follows it.
 * Doxygen accepts `///` and `//!` as well as the two block openers; a `////`
 * banner line and the trailing `<` forms do not count.
 */
function isCFamilyDocComment(text: string): boolean {
  if (text.startsWith("////") || C_FAMILY_TRAILING_DOC.test(text)) return false;
  return C_FAMILY_DOC_OPENERS.some((opener) => text.startsWith(opener));
}

/** Checks if a line starts a doc comment based on language conventions. */
export function isDocComment(line: string, language: SupportedLanguage): boolean {
  if (isCFamily(language)) return isCFamilyDocComment(line);
  if (JSDOC_LANGUAGES.includes(language)) {
    // Require the JSDoc opener; plain /* ... */ block comments (e.g. eslint-disable)
    // are not documentation. Continuation lines (*, */) are handled by the caller
    // scanning upward through comment lines to the opening line.
    return line.startsWith("/**");
  }
  if (language === "python") return line.startsWith('"""') || line.startsWith("'''");
  if (language === "rust") return isRustDocComment(line);
  if (language === "go") return line.startsWith("//");
  if (language === "ruby") return line.startsWith("#");
  return line.startsWith("/**") || line.startsWith("///");
}

/** Checks if comment text represents a doc comment (for AST comment nodes). */
export function isDocCommentText(text: string, language: SupportedLanguage): boolean {
  if (isCFamily(language)) return isCFamilyDocComment(text);
  if (JSDOC_LANGUAGES.includes(language)) return text.startsWith("/**");
  if (language === "python") return text.startsWith('"""') || text.startsWith("'''");
  if (language === "rust") return isRustDocComment(text);
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

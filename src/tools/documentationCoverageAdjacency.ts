import type Parser from "tree-sitter";
import type { SupportedLanguage } from "../types/index.js";
import { isCommentNode, isDocCommentText } from "./documentationCoverageLanguageUtils.js";

/**
 * Parents that wrap a declaration without separating it from a comment above it.
 * `export function f()` and `@dec class C` put the doc comment above the wrapper,
 * so the wrapper's first row is where the declaration really starts.
 */
const DECLARATION_WRAPPERS = new Set([
  "export_statement",
  "decorated_definition",
  "variable_declarator",
  "lexical_declaration",
  "variable_declaration",
  "public_field_definition",
]);

/** Siblings that sit between a doc comment and the declaration it documents. */
const PREFIX_SIBLINGS = new Set(["decorator", "attribute_item"]);

/** Rust states documentation in an attribute as `#[doc = "..."]`. */
const RUST_DOC_ATTRIBUTE = /^#\s*\[\s*doc\s*=/;

/** Where a declaration starts and whether an adjacent doc comment was found. */
export interface DocLookup {
  documented: boolean;
  /** First row of the declaration, decorators and attributes included. */
  anchorRow: number;
}

/**
 * Last row a node occupies.
 * tree-sitter-rust ends a `line_comment` on the row after its text, so the
 * trailing newline has to come off before the row is counted.
 */
function lastRow(node: Parser.SyntaxNode): number {
  const trimmed = node.text.replace(/\s+$/, "");
  return node.startPosition.row + (trimmed.split("\n").length - 1);
}

/** True when only whitespace precedes the node on its first line. */
function startsOwnLine(node: Parser.SyntaxNode, lines: string[]): boolean {
  const line = lines[node.startPosition.row] ?? "";
  return line.slice(0, node.startPosition.column).trim() === "";
}

/**
 * True when a node may be replaced by its parent for the purpose of finding the
 * declaration's first row. A declaration that follows another one on an earlier
 * row (`const a = 1,\n  b = () => {}`) must not inherit the first one's position.
 */
function canWiden(node: Parser.SyntaxNode): boolean {
  const previous = node.previousNamedSibling;
  if (previous === null) return true;
  if (PREFIX_SIBLINGS.has(previous.type)) return true;
  return previous.startPosition.row === node.startPosition.row;
}

/** Climbs through wrappers that share the declaration's leading row. */
function widenThroughWrappers(node: Parser.SyntaxNode): Parser.SyntaxNode {
  let current = node;
  while (
    current.parent !== null &&
    DECLARATION_WRAPPERS.has(current.parent.type) &&
    canWiden(current)
  ) {
    current = current.parent;
  }
  return current;
}

/** True for a Rust `#[doc = "..."]` attribute, which documents the item it precedes. */
function isRustDocAttribute(node: Parser.SyntaxNode, language: SupportedLanguage): boolean {
  return (
    language === "rust" && node.type === "attribute_item" && RUST_DOC_ATTRIBUTE.test(node.text)
  );
}

/**
 * Finds the comment block immediately above a declaration.
 *
 * A comment documents a declaration only when its last line is the line directly
 * above the declaration's first line, counting decorators and attributes as part
 * of the declaration. A blank line, a trailing comment on another statement's
 * line, or another declaration in between all break the association.
 */
export function findDocAbove(
  node: Parser.SyntaxNode,
  lines: string[],
  language: SupportedLanguage
): DocLookup {
  const declaration = widenThroughWrappers(node);
  let anchorRow = declaration.startPosition.row;
  let sibling = declaration.previousSibling;

  while (
    sibling !== null &&
    PREFIX_SIBLINGS.has(sibling.type) &&
    lastRow(sibling) === anchorRow - 1
  ) {
    if (isRustDocAttribute(sibling, language)) return { documented: true, anchorRow };
    anchorRow = sibling.startPosition.row;
    sibling = sibling.previousSibling;
  }

  // Stacked comment lines directly above each other are one doc block.
  let commentRow = anchorRow;
  while (
    sibling !== null &&
    isCommentNode(sibling) &&
    lastRow(sibling) === commentRow - 1 &&
    startsOwnLine(sibling, lines)
  ) {
    if (isDocCommentText(sibling.text, language)) return { documented: true, anchorRow };
    commentRow = sibling.startPosition.row;
    sibling = sibling.previousSibling;
  }

  return { documented: false, anchorRow };
}

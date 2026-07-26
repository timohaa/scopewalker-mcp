import type Parser from "tree-sitter";
import type { SupportedLanguage } from "../types/index.js";
import { parseCode } from "./treeSitter.js";

export interface CommentInfo {
  startLine: number;
  endLine: number;
  /** 0-based column where the comment starts on its first line. */
  startColumn: number;
  /** 0-based column just past the comment's end on its last line. */
  endColumn: number;
  text: string;
}

/**
 * Extracts comment nodes from parsed code.
 * Returns line ranges for each comment for accurate counting.
 */
export async function getComments(
  code: string,
  language: SupportedLanguage
): Promise<CommentInfo[]> {
  const tree = await parseCode(code, language);
  if (tree === null) {
    return [];
  }

  const comments: CommentInfo[] = [];
  walkTreeForComments(tree.rootNode, comments);
  return comments;
}

/** Traverses AST to find comment nodes. */
function walkTreeForComments(node: Parser.SyntaxNode, comments: CommentInfo[]): void {
  // Tree-sitter uses "comment" type for most languages
  if (node.type === "comment" || node.type === "line_comment" || node.type === "block_comment") {
    comments.push({
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      startColumn: node.startPosition.column,
      endColumn: node.endPosition.column,
      text: node.text,
    });
  }

  for (const child of node.children) {
    walkTreeForComments(child, comments);
  }
}

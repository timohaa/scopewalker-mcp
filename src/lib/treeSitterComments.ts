import type Parser from "tree-sitter";
import type { SupportedLanguage } from "../types/index.js";
import { parseCode } from "./treeSitter.js";

export interface CommentInfo {
  startLine: number;
  endLine: number;
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
      text: node.text,
    });
  }

  for (const child of node.children) {
    walkTreeForComments(child, comments);
  }
}

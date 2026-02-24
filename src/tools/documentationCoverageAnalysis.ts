import type Parser from "tree-sitter";
import { walkNode } from "../lib/astWalker.js";
import type {
  DocumentationCoverageResult,
  FileDocumentation,
  SupportedLanguage,
  UndocumentedItem,
} from "../types/index.js";
import {
  isCommentNode,
  isDocCommentText,
  isDocComment,
  isAnyComment,
  hasPythonDocstring,
} from "./documentationCoverageLanguageUtils.js";
import { getDocumentableNode } from "./documentationCoverageNodeDetection.js";

/** Configuration for building documentation coverage result. */
export interface CoverageConfig {
  resolvedPath: string;
  summaryOnly: boolean;
  limit?: number;
}

/** Coverage data collected from file analysis. */
export interface CoverageData {
  byFile: FileDocumentation[];
  undocumentedItems: UndocumentedItem[];
  totalDocumented: number;
  totalUndocumented: number;
}

export interface FileAnalysis {
  documented: number;
  undocumented: number;
  items: UndocumentedItem[];
}

/** Checks preceding siblings for documentation comments. */
function hasDocInSiblings(node: Parser.SyntaxNode, language: SupportedLanguage): boolean {
  const prevNamed = node.previousNamedSibling;
  if (
    prevNamed !== null &&
    isCommentNode(prevNamed) &&
    isDocCommentText(prevNamed.text, language)
  ) {
    return true;
  }

  let sibling = node.previousSibling;
  while (sibling !== null) {
    if (isCommentNode(sibling) && isDocCommentText(sibling.text, language)) {
      return true;
    }
    const isWhitespace = sibling.type.includes("newline") || sibling.text.trim() === "";
    if (!isWhitespace && !isCommentNode(sibling)) break;
    sibling = sibling.previousSibling;
  }
  return false;
}

/** Fallback: checks preceding source lines for doc comments. */
function hasDocInPrecedingLines(
  node: Parser.SyntaxNode,
  lines: string[],
  lang: SupportedLanguage
): boolean {
  const startLine = node.startPosition.row;
  for (let i = startLine - 1; i >= 0 && i >= startLine - 5; i--) {
    const line = lines[i]?.trim() || "";
    if (line === "") continue;
    if (isDocComment(line, lang)) return true;
    if (!isAnyComment(line)) break;
  }
  return false;
}

/**
 * Checks for documentation using AST-based analysis.
 * Uses tree-sitter to find preceding comment nodes rather than line-based heuristics.
 */
export function hasDocumentation(
  node: Parser.SyntaxNode,
  lines: string[],
  language: SupportedLanguage
): boolean {
  if (language === "python" && hasPythonDocstring(node)) return true;
  if (hasDocInSiblings(node, language)) return true;
  return hasDocInPrecedingLines(node, lines, language);
}

/** Options for analyzing documentation coverage of a single file. */
export interface FileAnalysisOptions {
  rootNode: Parser.SyntaxNode;
  lines: string[];
  language: SupportedLanguage;
  filePath: string;
  minLines: number;
}

/** Analyzes a file's AST and returns documentation coverage stats. */
export function analyzeFileDocumentation(options: FileAnalysisOptions): FileAnalysis {
  const { rootNode, lines, language, filePath, minLines } = options;
  let documented = 0;
  let undocumented = 0;
  const items: UndocumentedItem[] = [];

  walkNode(rootNode, (node) => {
    const docTarget = getDocumentableNode(node);
    if (!docTarget) return;

    const { name, type, lineCount } = docTarget;
    const line = node.startPosition.row + 1;

    if (lineCount < minLines) return;

    const hasDoc = hasDocumentation(node, lines, language);

    if (hasDoc) {
      documented++;
    } else {
      undocumented++;
      items.push({
        path: filePath,
        name,
        type,
        line,
        lines: lineCount,
      });
    }
  });

  return { documented, undocumented, items };
}

/** Constructs the documentation coverage result object. */
export function buildDocumentationCoverageResult(
  config: CoverageConfig,
  data: CoverageData
): DocumentationCoverageResult {
  const { resolvedPath, summaryOnly, limit } = config;
  const { byFile, undocumentedItems, totalDocumented, totalUndocumented } = data;

  const totalSymbols = totalDocumented + totalUndocumented;
  const percentage =
    totalSymbols > 0 ? Math.round((totalDocumented / totalSymbols) * 1000) / 10 : 100;

  let limitedItems = undocumentedItems;
  let itemsTruncated = false;
  if (limit !== undefined && undocumentedItems.length > limit) {
    limitedItems = undocumentedItems.slice(0, limit);
    itemsTruncated = true;
  }

  const result: DocumentationCoverageResult = {
    path: resolvedPath,
    coverage: {
      documented: totalDocumented,
      undocumented: totalUndocumented,
      percentage,
    },
    undocumented_items: summaryOnly ? [] : limitedItems,
    by_file: summaryOnly ? [] : byFile,
    summary: {
      files_analyzed: byFile.length,
      total_symbols: totalSymbols,
      fully_documented_files: byFile.filter((f) => f.undocumented === 0).length,
      zero_documentation_files: byFile.filter((f) => f.documented === 0).length,
    },
  };

  if (itemsTruncated && !summaryOnly && limit !== undefined) {
    result.truncated = {
      items: limit,
      total: undocumentedItems.length,
    };
  }

  return result;
}

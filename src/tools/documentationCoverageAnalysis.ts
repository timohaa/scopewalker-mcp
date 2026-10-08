import type Parser from "tree-sitter";
import { walkNode } from "../lib/astWalker.js";
import type {
  DocumentationCoverageResult,
  FileDocumentation,
  SupportedLanguage,
  UndocumentedItem,
} from "../types/index.js";
import { findDocAbove, hasTrailingDoc } from "./documentationCoverageAdjacency.js";
import { cSymbolKey, isHiddenCSymbol } from "./documentationCoverageCppScope.js";
import {
  isDocComment,
  isAnyComment,
  isCFamily,
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
  /** Supported files that were never parsed, so their symbols are in no total. */
  filesSkipped: number;
}

/** One documentable symbol found in a file. */
export interface DocSymbol {
  item: UndocumentedItem;
  documented: boolean;
  /** C/C++ only: joins a header declaration with its definition in another file. */
  key: string | null;
  /** C/C++ only: outside any public API, so its whole group is left out. */
  hidden: boolean;
}

/** Result of analyzing a single file's documentation coverage. */
export interface FileAnalysis {
  symbols: DocSymbol[];
}

/**
 * How many lines above a declaration the fallback scans for a doc comment.
 * Must span a multi-line comment block written as consecutive single-line comments.
 */
const MAX_LOOKBACK_LINES = 30;

/**
 * Fallback for grammars whose comment nodes this tool does not classify: reads
 * the comment block ending on the line directly above the declaration. A blank
 * line or a line of code ends the block, so a remark about the previous
 * declaration cannot document this one.
 */
function hasDocInPrecedingLines(
  anchorRow: number,
  lines: string[],
  lang: SupportedLanguage
): boolean {
  for (let i = anchorRow - 1; i >= 0 && i >= anchorRow - MAX_LOOKBACK_LINES; i--) {
    const line = lines[i]?.trim() ?? "";
    if (line === "") return false;
    if (isDocComment(line, lang)) return true;
    if (!isAnyComment(line)) return false;
  }
  return false;
}

/**
 * Checks AST docstrings, C/C++ trailing member comments, and the comment block
 * directly above the declaration, then falls back to the preceding source lines.
 */
export function hasDocumentation(
  node: Parser.SyntaxNode,
  lines: string[],
  language: SupportedLanguage
): boolean {
  if (language === "python" && hasPythonDocstring(node)) return true;
  if (hasTrailingDoc(node, language)) return true;

  const { documented, anchorRow } = findDocAbove(node, lines, language);
  if (documented) return true;

  return hasDocInPrecedingLines(anchorRow, lines, language);
}

/** Options for analyzing documentation coverage of a single file. */
export interface FileAnalysisOptions {
  rootNode: Parser.SyntaxNode;
  lines: string[];
  language: SupportedLanguage;
  filePath: string;
}

/**
 * Analyzes a file's AST and returns every documentable symbol in it.
 * Counting happens later, once C/C++ declarations are joined across files.
 */
export function analyzeFileDocumentation(options: FileAnalysisOptions): FileAnalysis {
  const { rootNode, lines, language, filePath } = options;
  const cFamily = isCFamily(language);
  const symbols: DocSymbol[] = [];

  walkNode(rootNode, (node) => {
    const docTarget = getDocumentableNode(node);
    if (!docTarget) return;

    const { name, type, lineCount } = docTarget;
    symbols.push({
      item: { path: filePath, name, type, line: node.startPosition.row + 1, lines: lineCount },
      documented: hasDocumentation(node, lines, language),
      key: cFamily ? cSymbolKey(node, name, type === "class") : null,
      hidden: cFamily && isHiddenCSymbol(node),
    });
  });

  return { symbols };
}

/** Constructs the documentation coverage result object. */
export function buildDocumentationCoverageResult(
  config: CoverageConfig,
  data: CoverageData
): DocumentationCoverageResult {
  const { resolvedPath, summaryOnly, limit } = config;
  const { byFile, undocumentedItems, totalDocumented, totalUndocumented, filesSkipped } = data;

  const totalSymbols = totalDocumented + totalUndocumented;
  const scanComplete = filesSkipped === 0;
  // Nothing analyzed is full coverage only when nothing was left out: a file
  // skipped by the size guard must not read as 100% documented.
  const emptyPercentage = scanComplete ? 100 : 0;
  const percentage =
    totalSymbols > 0 ? Math.round((totalDocumented / totalSymbols) * 1000) / 10 : emptyPercentage;

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
      files_skipped: filesSkipped,
      scan_complete: scanComplete,
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

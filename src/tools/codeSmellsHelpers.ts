import { readFile } from "node:fs/promises";
import type Parser from "tree-sitter";
import { detectLanguage, parseCode } from "../lib/treeSitter.js";
import { getComments } from "../lib/treeSitterComments.js";
import type { CodeSmell, CodeSmellsResult, CodeSmellType, FileSmells } from "../types/index.js";
import { isFileWithinSizeLimit } from "../utils/fileGuards.js";

/** Maximum number of smells per file to include in response. */
const MAX_SMELLS_PER_FILE = 50;

/** Options for building code smells result. */
export interface BuildCodeSmellsResultOptions {
  resolvedPath: string;
  isDirectory: boolean;
  files: FileSmells[];
  byType: Record<CodeSmellType, number>;
  totalFilesScanned: number;
  limit?: number;
}

/** Comment-based smell types (detected via regex in comments). */
export const COMMENT_SMELL_TYPES: CodeSmellType[] = [
  "todo",
  "fixme",
  "hack",
  "xxx",
  "bug",
  "unused",
  "deprecated",
];

/** Code-based smell types (detected via AST patterns). */
export const CODE_SMELL_TYPES: CodeSmellType[] = ["unsafe_cast"];

/** Patterns for detecting code smells in comments. */
export const SMELL_PATTERNS: Record<string, RegExp> = {
  todo: /\bTODO\b/i,
  fixme: /\bFIXME\b/i,
  hack: /\bHACK\b/i,
  xxx: /\bXXX\b/i,
  bug: /\bBUG\b/i,
  unused: /\bUNUSED\b/i,
  deprecated: /\bDEPRECATED\b/i,
};

export const ALL_SMELL_TYPES: CodeSmellType[] = [
  "todo",
  "fixme",
  "hack",
  "xxx",
  "bug",
  "unused",
  "deprecated",
  "unsafe_cast",
];

/** Maximum length for smell text to prevent huge responses. */
const MAX_TEXT_LENGTH = 200;

/** Truncates text to max length with ellipsis. */
function truncateText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_TEXT_LENGTH) {
    return trimmed;
  }
  return trimmed.slice(0, MAX_TEXT_LENGTH) + "...";
}

/** Creates an empty smell counter for all smell types. */
export function createEmptySmellCounts(): Record<CodeSmellType, number> {
  return { todo: 0, fixme: 0, hack: 0, xxx: 0, bug: 0, unused: 0, deprecated: 0, unsafe_cast: 0 };
}

/** Increments smell counts based on detected smells. */
export function updateSmellCounts(
  byType: Record<CodeSmellType, number>,
  smells: CodeSmell[]
): void {
  for (const smell of smells) {
    byType[smell.type]++;
  }
}

/** Processes a single file for code smells. Returns FileSmells if any found, null otherwise. */
export async function processFileForSmells(
  fullPath: string,
  relativePath: string,
  typesToDetect: CodeSmellType[],
  includeText: boolean
): Promise<FileSmells | null> {
  try {
    const language = detectLanguage(fullPath);

    // Skip files with unrecognized languages to avoid false positives from binary/non-code files
    if (!language) {
      return null;
    }

    const withinLimit = await isFileWithinSizeLimit(fullPath);
    if (!withinLimit) {
      return null;
    }

    const content = await readFile(fullPath, "utf-8");
    const smells: CodeSmell[] = [];

    // Detect comment-based smells
    const commentTypesToDetect = typesToDetect.filter((t) => COMMENT_SMELL_TYPES.includes(t));
    if (commentTypesToDetect.length > 0) {
      const comments = await getComments(content, language);
      const commentSmells = detectSmellsInComments(
        comments,
        relativePath,
        commentTypesToDetect,
        includeText
      );
      smells.push(...commentSmells);
    }

    // Detect code-based smells (AST patterns)
    const codeTypesToDetect = typesToDetect.filter((t) => CODE_SMELL_TYPES.includes(t));
    if (codeTypesToDetect.length > 0 && (language === "typescript" || language === "javascript")) {
      const codeSmells = await detectCodeBasedSmells(
        content,
        language,
        relativePath,
        codeTypesToDetect,
        includeText
      );
      smells.push(...codeSmells);
    }

    return smells.length > 0 ? { path: relativePath, smells } : null;
  } catch {
    return null;
  }
}

/** Scans comments for code smell patterns using tree-sitter extracted comments. */
export function detectSmellsInComments(
  comments: { startLine: number; endLine: number; text: string }[],
  filePath: string,
  typesToDetect: CodeSmellType[],
  includeText: boolean
): CodeSmell[] {
  const smells: CodeSmell[] = [];

  for (const comment of comments) {
    for (const type of typesToDetect) {
      const pattern = SMELL_PATTERNS[type];
      if (pattern.test(comment.text)) {
        smells.push({
          path: filePath,
          line: comment.startLine,
          type,
          text: includeText ? truncateText(comment.text) : "<redacted>",
        });
      }
    }
  }

  return smells;
}

/**
 * Detects code-based smells using AST analysis.
 * Currently detects: unsafe_cast ("as unknown as" pattern in TypeScript)
 */
async function detectCodeBasedSmells(
  content: string,
  language: "typescript" | "javascript",
  filePath: string,
  typesToDetect: CodeSmellType[],
  includeText: boolean
): Promise<CodeSmell[]> {
  const smells: CodeSmell[] = [];

  if (typesToDetect.includes("unsafe_cast")) {
    const tree = await parseCode(content, language);
    if (tree) {
      const unsafeCasts = findUnsafeCasts(tree.rootNode, content);
      for (const cast of unsafeCasts) {
        smells.push({
          path: filePath,
          line: cast.line,
          type: "unsafe_cast",
          text: includeText ? truncateText(cast.text) : "<redacted>",
        });
      }
    }
  }

  return smells;
}

interface UnsafeCastMatch {
  line: number;
  text: string;
}

/**
 * Finds "as unknown as" patterns in the AST.
 * Pattern: as_expression containing "unknown" type, whose parent is also an as_expression.
 */
function findUnsafeCasts(node: Parser.SyntaxNode, content: string): UnsafeCastMatch[] {
  const matches: UnsafeCastMatch[] = [];

  walkTreeForUnsafeCasts(node, matches, content);

  return matches;
}

/** Recursively walks the AST looking for unsafe cast patterns. */
function walkTreeForUnsafeCasts(
  node: Parser.SyntaxNode,
  matches: UnsafeCastMatch[],
  content: string
): void {
  // Look for "as_expression" nodes that represent "as unknown as T" pattern
  // The AST structure is: as_expression(as_expression(expr, unknown), T)
  // tree-sitter TypeScript doesn't use field names, so we access children positionally
  if (node.type === "as_expression") {
    const namedChildren = node.namedChildren;
    // First named child is the expression (could be another as_expression)
    // Last named child is the target type
    if (namedChildren.length > 0 && namedChildren[0].type === "as_expression") {
      const innerExpr = namedChildren[0];
      // Check if the inner as_expression casts to "unknown" or "any"
      // Inner as_expression: first child is expr, last child is the intermediate type
      const innerNamedChildren = innerExpr.namedChildren;
      if (
        innerNamedChildren.length > 0 &&
        isUnknownOrAnyType(innerNamedChildren[innerNamedChildren.length - 1])
      ) {
        // This is an "as unknown as T" pattern
        // Get the text of the full expression
        const lineStart = node.startPosition.row;
        const lineEnd = node.endPosition.row;
        const lines = content.split("\n").slice(lineStart, lineEnd + 1);
        const text = lines.join("\n").trim();

        matches.push({
          line: node.startPosition.row + 1, // Convert to 1-indexed
          text,
        });
        return; // Don't descend further into this node
      }
    }
  }

  for (const child of node.children) {
    walkTreeForUnsafeCasts(child, matches, content);
  }
}

/** Checks if a type node represents "unknown" or "any". */
function isUnknownOrAnyType(typeNode: Parser.SyntaxNode): boolean {
  // For simple type identifiers like "unknown" or "any"
  if (typeNode.type === "predefined_type" || typeNode.type === "type_identifier") {
    const text = typeNode.text.toLowerCase();
    return text === "unknown" || text === "any";
  }
  return false;
}

/** Constructs the code smells result object. */
export function buildCodeSmellsResult(options: BuildCodeSmellsResultOptions): CodeSmellsResult {
  const { resolvedPath, isDirectory, files, byType, totalFilesScanned, limit } = options;
  const totalSmells = Object.values(byType).reduce((sum, count) => sum + count, 0);
  const sortedFiles = files.sort((a, b) => b.smells.length - a.smells.length);
  const limitedFiles = limit !== undefined ? sortedFiles.slice(0, limit) : sortedFiles;

  // Apply per-file smell limit to prevent huge responses
  const cappedFiles = limitedFiles.map((file) => ({
    ...file,
    smells: file.smells.slice(0, MAX_SMELLS_PER_FILE),
  }));

  return {
    path: resolvedPath,
    is_directory: isDirectory,
    files: cappedFiles,
    summary: {
      total_files_scanned: totalFilesScanned,
      files_with_smells: files.length,
      total_smells: totalSmells,
      by_type: byType,
    },
  };
}

import type Parser from "tree-sitter";
import type { DeadCodeCandidate, DeadCodeItem, SupportedLanguage } from "../types/index.js";

// Matches an identifier in any grammar: Unicode letters plus the `_`/`$` that
// JS, PHP-style and Go generated names use. Applied to raw leaf text, so it also
// picks names out of strings, symbols, macro bodies and JSX.
const TOKEN_PATTERN = /[\p{L}\p{Nl}_$][\p{L}\p{N}_$]*/gu;

// Go build directives name a symbol that only the toolchain or a C caller uses.
const GO_DIRECTIVE = /^\s*\/\/(?:export|go:linkname)\s+(\S+)/gm;

/** Splits arbitrary text into identifier-shaped tokens. */
export function tokenize(text: string): string[] {
  return text.match(TOKEN_PATTERN) ?? [];
}

/** Adds one to a name's tally. */
function bump(counts: Map<string, number>, name: string): void {
  counts.set(name, (counts.get(name) ?? 0) + 1);
}

/** Counts the symbols named by Go `//export` and `//go:linkname` directives. */
function countGoDirectives(text: string, counts: Map<string, number>): void {
  GO_DIRECTIVE.lastIndex = 0;
  let match = GO_DIRECTIVE.exec(text);
  while (match !== null) {
    for (const token of tokenize(match[1])) {
      bump(counts, token);
    }
    match = GO_DIRECTIVE.exec(text);
  }
}

/** Detects the comment node types every grammar spells differently. */
function isComment(node: Parser.SyntaxNode): boolean {
  return node.type.includes("comment");
}

/**
 * Tallies every identifier-shaped token in a file's leaves.
 *
 * The walk is an explicit stack rather than `walkNode` because the shared
 * walker stops at depth 500: a reference hidden below that would silently turn
 * a live symbol into a false alarm. Comments do not count as references, since
 * a name surviving only in prose is exactly what this tool looks for.
 */
export function countOccurrences(
  root: Parser.SyntaxNode,
  counts: Map<string, number>,
  language: SupportedLanguage
): void {
  const stack: Parser.SyntaxNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) break;

    if (isComment(node)) {
      if (language === "go") countGoDirectives(node.text, counts);
      continue;
    }

    if (node.childCount === 0) {
      for (const token of tokenize(node.text)) {
        bump(counts, token);
      }
      continue;
    }

    for (const child of node.children) {
      stack.push(child);
    }
  }
}

export interface DeadCodeFindings {
  deadCode: DeadCodeItem[];
  unreferencedExports: DeadCodeItem[];
}

/** Orders findings the way a reader scans a scan: file first, then line. */
function byLocation(a: DeadCodeItem, b: DeadCodeItem): number {
  return a.file.localeCompare(b.file) || a.line - b.line;
}

/**
 * Splits unreferenced candidates into proven-dead and needs-judgement lists.
 *
 * A finding is only certain when everything that could reach the symbol was in
 * the scan: its own file for `local`, the whole scanned directory for `package`.
 * An incomplete scan demotes every finding, because the file that was skipped
 * is exactly the one that might hold the reference.
 */
export function resolveFindings(
  candidates: DeadCodeCandidate[],
  occurrences: Map<string, number>,
  declarations: Map<string, number>,
  packageScanned: boolean,
  scanComplete: boolean
): DeadCodeFindings {
  const deadCode: DeadCodeItem[] = [];
  const unreferencedExports: DeadCodeItem[] = [];

  for (const candidate of candidates) {
    const references =
      (occurrences.get(candidate.key) ?? 0) - (declarations.get(candidate.key) ?? 0);
    if (references !== 0) continue;

    const proven =
      scanComplete &&
      (candidate.scope === "local" || (candidate.scope === "package" && packageScanned));

    const item: DeadCodeItem = {
      file: candidate.file,
      name: candidate.name,
      type: candidate.type,
      line: candidate.line,
    };

    if (proven) {
      deadCode.push(item);
    } else {
      unreferencedExports.push(item);
    }
  }

  deadCode.sort(byLocation);
  unreferencedExports.sort(byLocation);

  return { deadCode, unreferencedExports };
}

import type { CodeSmell, CodeSmellType } from "../types/index.js";

/** Maximum length for smell text to prevent huge responses. */
const MAX_TEXT_LENGTH = 200;

/** Truncates text to max length with ellipsis. */
export function truncateText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_TEXT_LENGTH) {
    return trimmed;
  }
  return trimmed.slice(0, MAX_TEXT_LENGTH) + "...";
}

/**
 * Trailing form a marker keyword may take: immediately (or after a single
 * space) followed by `:`, `(`, or `-`, or nothing else on the line. This is
 * what distinguishes a marker annotation ("TODO: fix", "FIXME - later") from
 * the same uppercase word appearing mid-sentence in shouted prose.
 */
const MARKER_SUFFIX = "(?:[:(-]|\\s[:(-]|\\s*$)";

/** Builds the case-sensitive, whole-word, marker-suffixed pattern for one keyword. */
function markerPattern(keyword: string): RegExp {
  return new RegExp(`\\b${keyword}\\b${MARKER_SUFFIX}`);
}

/**
 * Patterns for detecting code smells in comments, tested one line at a time
 * (see detectSmellsInComments). Each matches only the marker *form* of its
 * keyword - UPPERCASE as a whole word, optionally followed by `:`, `(`, or
 * `-` (`TODO: x`, `TODO(name): x`, `FIXME - x`) - not the word anywhere in
 * ordinary prose ("avoid the bug that Safari has" does not match `bug`).
 */
export const SMELL_PATTERNS: Partial<Record<CodeSmellType, RegExp>> = {
  todo: markerPattern("TODO"),
  fixme: markerPattern("FIXME"),
  hack: markerPattern("HACK"),
  xxx: markerPattern("XXX"),
  bug: markerPattern("BUG"),
  unused: markerPattern("UNUSED"),
  deprecated: markerPattern("DEPRECATED"),
};

/**
 * Strips a line's leading comment-opening delimiter (`//`, `/*`, `#`, `--`,
 * possibly repeated) and surrounding whitespace, so the lowercase-marker
 * check below can look at the first real word of the comment.
 */
function stripCommentOpener(line: string): string {
  return line.replace(/^\s*(?:\/\*+|\/\/+|#+|--+)\s*/, "").trimStart();
}

/**
 * Matches the lowercase marker form, accepted only at the very start of the
 * comment and only when immediately followed by `:` (`// todo: x`). This is
 * deliberately narrower than the uppercase form: a lowercase word anywhere
 * else in the comment is ordinary prose, not a marker.
 */
function matchesLowercaseMarker(firstLine: string, type: CodeSmellType): boolean {
  const body = stripCommentOpener(firstLine);
  return body.startsWith(`${type}:`);
}

/**
 * Scans comments for code smell patterns using tree-sitter extracted comments.
 *
 * Each comment is checked line by line (a block comment spans several source
 * lines) so the reported `line` is where the marker actually sits, not the
 * comment node's start line.
 */
export function detectSmellsInComments(
  comments: { startLine: number; endLine: number; text: string }[],
  filePath: string,
  typesToDetect: CodeSmellType[],
  includeText: boolean
): CodeSmell[] {
  const smells: CodeSmell[] = [];

  for (const comment of comments) {
    const lines = comment.text.split("\n");
    const text = includeText ? truncateText(comment.text) : "<redacted>";

    for (const type of typesToDetect) {
      const pattern = SMELL_PATTERNS[type];
      if (!pattern) continue;

      lines.forEach((line, index) => {
        const isMarker = pattern.test(line) || (index === 0 && matchesLowercaseMarker(line, type));
        if (isMarker) {
          smells.push({ path: filePath, line: comment.startLine + index, type, text });
        }
      });
    }
  }

  return smells;
}

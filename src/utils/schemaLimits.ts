/**
 * Shared ceilings for tool input schemas. Every tool exposes numeric knobs
 * (max_files, max_depth, limit, ...) and array knobs (ignore_patterns,
 * extensions, ...) that callers control directly; without an upper bound a
 * caller can request work disproportionate to the task, so these caps are
 * applied uniformly instead of being duplicated (and drifting) per tool.
 * Parameters shared by every tool also carry their description here.
 */
import { isAbsolute } from "node:path";
import { z } from "zod";

export const MAX_FILES_CEILING = 10_000;
export const MAX_DEPTH_CEILING = 64;
export const LIMIT_CEILING = 5_000;
export const MAX_ARRAY_LENGTH = 100;
export const MAX_PATTERN_LENGTH = 512;

/**
 * An ignore pattern is matched as a glob relative to the scanned directory,
 * both by the `ignore` package (src/lib/glob.ts) and as a tokei `-e` flag
 * (src/lib/tokei.ts). A filesystem-absolute pattern (or an unexpanded `~`)
 * can never match those relative paths, so it silently excludes nothing
 * instead of doing what the caller expects.
 */
function isUnusablePattern(pattern: string): boolean {
  return isAbsolute(pattern) || pattern.startsWith("~");
}

const RELATIVE_PATTERN_MESSAGE =
  'ignore_patterns must be relative to the scanned path, not absolute (e.g. "vendor" or ' +
  '"**/vendor/**", not "/Users/you/project/vendor" or "~/project/vendor"); an absolute ' +
  "pattern never matches and would silently exclude nothing.";

/** Positive integer capped at `max`; optional so omitting it keeps each tool's own default. */
export const boundedInt = (max: number): z.ZodOptional<z.ZodNumber> =>
  z.number().int().positive().max(max).optional();

export const maxFilesSchema = boundedInt(MAX_FILES_CEILING).describe(
  "Stop after scanning this many files (default unlimited)"
);
export const maxDepthSchema = boundedInt(MAX_DEPTH_CEILING).describe(
  "Max directory depth to descend (default unlimited)"
);
export const limitSchema = boundedInt(LIMIT_CEILING);

export const pathSchema = z
  .string()
  .describe("File or directory to analyze; must be inside the allowed roots");

export const includeHiddenSchema = z
  .boolean()
  .optional()
  .describe("Include dotfiles and dot-directories (default false)");

export const summaryOnlySchema = z
  .boolean()
  .optional()
  .describe("Return summary totals without per-item details (default false)");

export const ignorePatternsSchema = z
  .array(
    z
      .string()
      .max(MAX_PATTERN_LENGTH)
      .refine((pattern) => !isUnusablePattern(pattern), { message: RELATIVE_PATTERN_MESSAGE })
  )
  .max(MAX_ARRAY_LENGTH)
  .optional()
  .describe("Extra gitignore-style patterns to exclude, relative to path");

/** Entries feed a fast-glob brace pattern, so only plain extension tokens are allowed. */
export const extensionsSchema = z
  .array(
    z
      .string()
      .max(32)
      .regex(/^\.?[A-Za-z0-9_+-]+$/)
  )
  .max(MAX_ARRAY_LENGTH)
  .optional()
  .describe('Only scan these extensions, e.g. [".ts", ".py"] (default all supported)');

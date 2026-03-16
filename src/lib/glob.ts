import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fg from "fast-glob";
import ignore from "ignore";

/** Common directories and files that should be excluded by default (build artifacts, caches, lock files, etc.) */
export const DEFAULT_IGNORE_PATTERNS: readonly string[] = [
  // Dependencies and build artifacts
  "**/node_modules/**",
  "**/.git/**",
  "**/coverage/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/.output/**",
  "**/.cache/**",
  "**/.parcel-cache/**",
  "**/.turbo/**",
  "**/out/**",
  "**/__pycache__/**",
  "**/.pytest_cache/**",
  "**/target/**",
  "**/vendor/**",
  // Lock files (generated, not useful to analyze)
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/bun.lockb",
  "**/Cargo.lock",
  "**/Gemfile.lock",
  "**/poetry.lock",
  "**/composer.lock",
  "**/go.sum",
];

export interface GlobOptions {
  cwd: string;
  includeHidden?: boolean;
  ignorePatterns?: string[];
  extensions?: string[];
  maxDepth?: number;
}

/**
 * Finds files matching criteria using fast-glob.
 * Automatically respects .gitignore if present using the `ignore` library.
 */
export async function findFiles(options: GlobOptions): Promise<string[]> {
  const { cwd, includeHidden = false, ignorePatterns = [], extensions, maxDepth } = options;

  let pattern = "**/*";
  if (extensions && extensions.length > 0) {
    const exts = extensions.map((e) => (e.startsWith(".") ? e.slice(1) : e));
    pattern = exts.length === 1 ? `**/*.${exts[0]}` : `**/*.{${exts.join(",")}}`;
  }

  // Create ignore filter from .gitignore and user patterns
  const ig = await createIgnoreFilter(cwd, ignorePatterns);

  const files = await fg(pattern, {
    cwd,
    dot: includeHidden,
    onlyFiles: true,
    deep: maxDepth,
    ignore: [...DEFAULT_IGNORE_PATTERNS],
  });

  // Filter results using the ignore library for proper gitignore semantics
  return files.filter((file) => !ig.ignores(file)).sort();
}

/**
 * Finds all entries (files and directories) for tree building.
 */
export async function findEntries(
  options: GlobOptions
): Promise<{ files: string[]; directories: string[] }> {
  const { cwd, includeHidden = false, ignorePatterns = [], maxDepth } = options;

  // Create ignore filter from .gitignore and user patterns
  const ig = await createIgnoreFilter(cwd, ignorePatterns);

  const [files, directories] = await Promise.all([
    fg("**/*", {
      cwd,
      dot: includeHidden,
      onlyFiles: true,
      deep: maxDepth,
      ignore: [...DEFAULT_IGNORE_PATTERNS],
    }),
    fg("**/*", {
      cwd,
      dot: includeHidden,
      onlyDirectories: true,
      deep: maxDepth,
      ignore: [...DEFAULT_IGNORE_PATTERNS],
    }),
  ]);

  // Filter results using the ignore library for proper gitignore semantics
  // For directories, append trailing slash for correct gitignore matching
  return {
    files: files.filter((file) => !ig.ignores(file)).sort(),
    directories: directories.filter((dir) => !ig.ignores(dir) && !ig.ignores(dir + "/")).sort(),
  };
}

/**
 * Creates an ignore filter that properly handles .gitignore patterns.
 * Uses the `ignore` library which correctly handles negation patterns,
 * escaped characters, directory-only patterns, and other gitignore semantics.
 */
async function createIgnoreFilter(
  cwd: string,
  userPatterns: string[]
): Promise<ReturnType<typeof ignore>> {
  const ig = ignore();

  // Load .gitignore if it exists
  try {
    const content = await readFile(join(cwd, ".gitignore"), "utf-8");
    ig.add(content);
  } catch {
    // No .gitignore file, continue without it
  }

  // Add user-provided patterns
  if (userPatterns.length > 0) {
    ig.add(userPatterns);
  }

  return ig;
}

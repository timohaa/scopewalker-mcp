import type { ErrorResponse } from "../types/index.js";
import { collectTokeiOutput, toAnalysisResult } from "./tokeiCollect.js";

// Tokei JSON output structure
export interface TokeiLanguageStats {
  blanks: number;
  code: number;
  comments: number;
  reports: TokeiFileReport[];
}

export interface TokeiFileReport {
  name: string;
  stats: {
    blanks: number;
    code: number;
    comments: number;
  };
}

export type TokeiOutput = Record<string, TokeiLanguageStats>;

export interface TokeiOptions {
  extensions?: string[];
  exclude?: string[];
  includeHidden?: boolean;
}

/**
 * Maps file extensions to tokei language names.
 * Tokei's -t flag expects language names (e.g., "TypeScript"), not extensions (e.g., "ts").
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TSX",
  mts: "TypeScript",
  cts: "TypeScript",
  js: "JavaScript",
  jsx: "JSX",
  mjs: "JavaScript",
  cjs: "JavaScript",
  py: "Python",
  go: "Go",
  rs: "Rust",
  java: "Java",
  c: "C",
  h: "C Header",
  cpp: "C++",
  cc: "C++",
  cxx: "C++",
  hpp: "C++ Header",
  rb: "Ruby",
  php: "PHP",
  cs: "C#",
  swift: "Swift",
  kt: "Kotlin",
  scala: "Scala",
  sh: "Shell",
  bash: "Bash",
  zsh: "Zsh",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  hcl: "HCL",
  tf: "HCL",
  tfvars: "HCL",
  xml: "XML",
  html: "HTML",
  css: "CSS",
  scss: "Sass",
  sass: "Sass",
  less: "Less",
  md: "Markdown",
  sql: "SQL",
  lua: "Lua",
  r: "R",
  dart: "Dart",
  ex: "Elixir",
  exs: "Elixir",
  erl: "Erlang",
  hs: "Haskell",
  ml: "OCaml",
  fs: "F#",
  fsx: "F#",
  vue: "Vue",
  svelte: "Svelte",
};

/**
 * Converts file extensions to tokei language names.
 * Unmapped extensions pass through unchanged as language names.
 */
function extensionsToLanguages(extensions: string[]): string[] {
  const languages = new Set<string>();
  for (const ext of extensions) {
    // Tokei's -t matching is case-insensitive, so "zig" matches its "Zig" language;
    // an unrecognized name yields an empty result.
    languages.add(EXTENSION_TO_LANGUAGE[ext.toLowerCase()] ?? ext);
  }
  return Array.from(languages);
}

export interface TokeiResult {
  success: true;
  data: TokeiOutput;
}

export interface TokeiError {
  success: false;
  error: ErrorResponse;
}

export type TokeiAnalysisResult = TokeiResult | TokeiError;

/**
 * Analyzes line counts using tokei CLI.
 * Tokei must be installed on the system.
 *
 * Streams stdout via spawn instead of execFile so an oversized tree fails
 * with a clear, structured error (output size or timeout) instead of a
 * generic maxBuffer crash.
 */
export async function analyze(
  path: string,
  options: TokeiOptions = {}
): Promise<TokeiAnalysisResult> {
  const args = buildArgs(path, options);
  const result = await collectTokeiOutput(args);
  return toAnalysisResult(result, path);
}

/** Builds CLI arguments for tokei invocation. */
function buildArgs(path: string, options: TokeiOptions): string[] {
  const args = [path, "--output", "json"];

  if (options.extensions !== undefined && options.extensions.length > 0) {
    // Always pass -t when the caller supplied extensions; omitting it would
    // return counts for every language instead of the requested subset.
    const languages = extensionsToLanguages(options.extensions);
    args.push("-t", languages.join(","));
  }

  if (options.exclude !== undefined && options.exclude.length > 0) {
    for (const pattern of options.exclude) {
      args.push("-e", pattern);
    }
  }

  if (options.includeHidden === true) {
    args.push("--hidden");
  }

  return args;
}

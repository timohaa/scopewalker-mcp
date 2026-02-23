import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ErrorResponse } from "../types/index.js";
import { createError } from "../utils/errors.js";

const execFileAsync = promisify(execFile);

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
}

/**
 * Maps file extensions to tokei language names.
 * Tokei's -t flag expects language names (e.g., "TypeScript"), not extensions (e.g., "ts").
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  mts: "TypeScript",
  cts: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
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
 * Unknown extensions are passed through unchanged (tokei will ignore them).
 */
function extensionsToLanguages(extensions: string[]): string[] {
  const languages = new Set<string>();
  for (const ext of extensions) {
    const lang = EXTENSION_TO_LANGUAGE[ext.toLowerCase()];
    if (lang) {
      languages.add(lang);
    }
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
 */
export async function analyze(
  path: string,
  options: TokeiOptions = {}
): Promise<TokeiAnalysisResult> {
  const args = buildArgs(path, options);

  try {
    const { stdout } = await execFileAsync("tokei", args, {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large codebases
    });

    const data = JSON.parse(stdout) as TokeiOutput;
    return { success: true, data };
  } catch (err) {
    if (isExecError(err) && err.code === "ENOENT") {
      return {
        success: false,
        error: createError(
          "TOOL_NOT_AVAILABLE",
          "tokei is not installed. Install with: brew install tokei"
        ),
      };
    }
    console.error("tokei error:", err);
    return {
      success: false,
      error: createError("PARSE_ERROR", "Failed to analyze line counts", {
        path,
      }),
    };
  }
}

/** Builds CLI arguments for tokei invocation. */
function buildArgs(path: string, options: TokeiOptions): string[] {
  const args = [path, "--output", "json"];

  if (options.extensions !== undefined && options.extensions.length > 0) {
    const languages = extensionsToLanguages(options.extensions);
    if (languages.length > 0) {
      args.push("-t", languages.join(","));
    }
  }

  if (options.exclude !== undefined && options.exclude.length > 0) {
    for (const pattern of options.exclude) {
      args.push("-e", pattern);
    }
  }

  return args;
}

interface ExecError extends Error {
  code?: string | number;
}

/** Type guard for exec errors with optional code property. */
function isExecError(err: unknown): err is ExecError {
  return err instanceof Error;
}

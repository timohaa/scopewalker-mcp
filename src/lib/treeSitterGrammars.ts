import type Parser from "tree-sitter";
import type { SupportedLanguage } from "../types/index.js";

const grammarCache = new Map<SupportedLanguage, Parser.Language>();

type GrammarLoader = () => Promise<Parser.Language | undefined>;

const grammarLoaders: Record<SupportedLanguage, GrammarLoader> = {
  typescript: async () => {
    const mod = await import("tree-sitter-typescript");
    return mod.default.tsx as Parser.Language | undefined;
  },
  javascript: async () => {
    const mod = await import("tree-sitter-javascript");
    return mod.default as Parser.Language | undefined;
  },
  python: async () => {
    const mod = await import("tree-sitter-python");
    return mod.default as Parser.Language | undefined;
  },
  go: async () => {
    const mod = await import("tree-sitter-go");
    return mod.default as Parser.Language | undefined;
  },
  rust: async () => {
    const mod = await import("tree-sitter-rust");
    return mod.default as Parser.Language | undefined;
  },
  java: async () => {
    const mod = await import("tree-sitter-java");
    return mod.default as Parser.Language | undefined;
  },
  c: async () => {
    const mod = await import("tree-sitter-c");
    return mod.default as Parser.Language | undefined;
  },
  cpp: async () => {
    const mod = await import("tree-sitter-c");
    return mod.default as Parser.Language | undefined;
  },
  ruby: async () => {
    const mod = await import("tree-sitter-ruby");
    return mod.default as Parser.Language | undefined;
  },
};

/** Lazily loads and caches tree-sitter grammar for a language. */
export async function loadGrammar(language: SupportedLanguage): Promise<Parser.Language | null> {
  const cached = grammarCache.get(language);
  if (cached) return cached;

  const loader = grammarLoaders[language];

  try {
    const grammar = await loader();
    if (grammar) {
      grammarCache.set(language, grammar);
      return grammar;
    }
    return null;
  } catch (err) {
    console.error(`Failed to load grammar for ${language}:`, err);
    return null;
  }
}

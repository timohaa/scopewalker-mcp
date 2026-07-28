import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadGrammar } from "./treeSitterGrammars.js";

describe("loadGrammar", () => {
  it("loads TypeScript grammar", async () => {
    const grammar = await loadGrammar("typescript");
    expect(grammar).not.toBeNull();
  });

  it("loads JavaScript grammar", async () => {
    const grammar = await loadGrammar("javascript");
    expect(grammar).not.toBeNull();
  });

  it("loads Python grammar", async () => {
    const grammar = await loadGrammar("python");
    expect(grammar).not.toBeNull();
  });

  it("loads Go grammar", async () => {
    const grammar = await loadGrammar("go");
    expect(grammar).not.toBeNull();
  });

  it("loads Rust grammar", async () => {
    const grammar = await loadGrammar("rust");
    expect(grammar).not.toBeNull();
  });

  it("loads Java grammar", async () => {
    const grammar = await loadGrammar("java");
    expect(grammar).not.toBeNull();
  });

  it("loads C grammar", async () => {
    const grammar = await loadGrammar("c");
    expect(grammar).not.toBeNull();
  });

  it("loads C++ grammar", async () => {
    const grammar = await loadGrammar("cpp");
    expect(grammar).not.toBeNull();
  });

  it("loads Ruby grammar", async () => {
    const grammar = await loadGrammar("ruby");
    expect(grammar).not.toBeNull();
  });

  it("returns null for unsupported language", async () => {
    // @ts-expect-error - testing unsupported language
    const grammar = await loadGrammar("unsupported");
    expect(grammar).toBeNull();
  });

  it("caches grammars on subsequent calls", async () => {
    const grammar1 = await loadGrammar("typescript");
    const grammar2 = await loadGrammar("typescript");
    expect(grammar1).toBe(grammar2);
  });
});

describe("loadGrammar error handling", () => {
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    originalConsoleError = console.error;
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
    vi.doUnmock("tree-sitter-ruby");
    vi.resetModules();
  });

  /**
   * Imports a fresh copy of the module so grammarCache starts empty — a cached
   * grammar from an earlier test would satisfy any assertion here vacuously.
   */
  async function freshLoadGrammar(): Promise<typeof loadGrammar> {
    vi.resetModules();
    const mod = await import("./treeSitterGrammars.js");
    return mod.loadGrammar;
  }

  it("returns null when a grammar module resolves without a language", async () => {
    vi.doMock("tree-sitter-ruby", () => ({ default: undefined }));

    const load = await freshLoadGrammar();

    expect(await load("ruby")).toBeNull();
  });

  it("returns null and logs the language when a grammar import throws", async () => {
    vi.doMock("tree-sitter-ruby", () => {
      throw new Error("Failed to load module");
    });

    const load = await freshLoadGrammar();

    expect(await load("ruby")).toBeNull();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("ruby"), expect.any(Error));
  });
});

import { describe, it, expect } from "vitest";
import { parseCode } from "../lib/treeSitter.js";
import type { SupportedLanguage } from "../types/index.js";
import { countOccurrences, tokenize } from "./deadCodeReferences.js";

/** Parses code and tallies its token occurrences, throwing if the grammar fails to load. */
async function countIn(code: string, language: SupportedLanguage): Promise<Map<string, number>> {
  const tree = await parseCode(code, language);
  if (tree === null) throw new Error("Failed to parse code");

  const counts = new Map<string, number>();
  countOccurrences(tree.rootNode, counts, language);
  return counts;
}

describe("deadCodeReferences - tokenize", () => {
  it("keeps a unicode identifier as one token", () => {
    expect(tokenize("café")).toEqual(["café"]);
  });

  it("keeps a $-prefixed name as one token", () => {
    expect(tokenize("$foo")).toEqual(["$foo"]);
  });

  it("extracts every word from quoted text", () => {
    expect(tokenize('"hello world"')).toEqual(["hello", "world"]);
  });

  it("finds nothing in text with no identifier-shaped characters", () => {
    expect(tokenize("+-*/();,.")).toEqual([]);
  });
});

describe("deadCodeReferences - countOccurrences", () => {
  it("counts a unicode identifier end to end", async () => {
    const counts = await countIn("const café = 1;\n", "typescript");
    expect(counts.get("café")).toBe(1);
  });

  it("counts a $-prefixed identifier end to end", async () => {
    const counts = await countIn("const $foo = 1;\n", "typescript");
    expect(counts.get("$foo")).toBe(1);
  });

  it("does not count a name that appears only in a comment", async () => {
    const counts = await countIn("// mentionMe\nfunction other() {}\n", "typescript");
    expect(counts.get("mentionMe")).toBeUndefined();
  });

  it("tokenizes the content of a string literal", async () => {
    const counts = await countIn('const x = "hello";\n', "typescript");
    expect(counts.get("hello")).toBe(1);
  });

  it("counts the symbol named by a Go //export directive", async () => {
    const counts = await countIn("package sample\n\n//export someName\nfunc other() {}\n", "go");
    expect(counts.get("someName")).toBeGreaterThanOrEqual(1);
  });

  it("counts the symbol named by a Go //go:linkname directive", async () => {
    const counts = await countIn(
      "package sample\n\n//go:linkname localName importpath.Symbol\nfunc other() {}\n",
      "go"
    );
    expect(counts.get("localName")).toBeGreaterThanOrEqual(1);
  });

  it("does not treat an ordinary Go comment as a directive", async () => {
    const counts = await countIn(
      "package sample\n\n// mentionedOnly is unused\nfunc other() {}\n",
      "go"
    );
    expect(counts.get("mentionedOnly")).toBeUndefined();
  });
});

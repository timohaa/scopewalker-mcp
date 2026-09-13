import { describe, expect, it } from "vitest";
import type { SourceFile } from "../lib/sourceFileWalker.js";
import { detectSmellsInComments, processFileForSmells } from "./codeSmellsHelpers.js";

describe("detectSmellsInComments - text truncation", () => {
  it("truncates comment text longer than the max length", () => {
    const longWord = "a".repeat(250);
    const comments = [{ startLine: 1, endLine: 1, text: `// TODO: ${longWord}` }];

    const smells = detectSmellsInComments(comments, "sample.ts", ["todo"], true);

    expect(smells[0]?.text.endsWith("...")).toBe(true);
    expect(smells[0]?.text.length).toBe(203); // 200 chars + "..."
  });
});

describe("processFileForSmells - unreadable content", () => {
  it("returns null when comment extraction throws", async () => {
    const file: SourceFile = {
      fullPath: "/virtual/broken.ts",
      relativePath: "broken.ts",
      language: "typescript",
      // tree-sitter's parser requires a string; a non-string input makes
      // getComments throw, which processFileForSmells must swallow.
      code: 12345 as unknown as string,
    };

    const result = await processFileForSmells(file, ["todo"], false);

    expect(result).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type { SourceFile } from "../lib/sourceFileWalker.js";
import { processFileForSmells } from "./codeSmellsHelpers.js";

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

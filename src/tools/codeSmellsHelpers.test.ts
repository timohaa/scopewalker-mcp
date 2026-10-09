import { describe, expect, it, vi } from "vitest";
import type { SourceFile } from "../lib/sourceFileWalker.js";
import { processFileForSmells } from "./codeSmellsHelpers.js";

vi.mock("../lib/treeSitterComments.js", () => ({
  getComments: vi.fn().mockRejectedValue(new Error("comment extraction failed")),
}));

describe("processFileForSmells - unreadable content", () => {
  it("returns null when comment extraction throws", async () => {
    const file: SourceFile = {
      fullPath: "/virtual/broken.ts",
      relativePath: "broken.ts",
      language: "typescript",
      code: "// TODO: unreachable because extraction is mocked to fail",
    };

    const result = await processFileForSmells(file, ["todo"], false);

    expect(result).toBeNull();
  });
});

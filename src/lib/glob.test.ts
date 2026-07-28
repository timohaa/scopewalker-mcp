import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { findFiles } from "./glob.js";

const fixturesDir = resolve(import.meta.dirname, "../__fixtures__");

describe("glob", () => {
  describe("findFiles", () => {
    it("finds all files in a directory", async () => {
      const files = await findFiles({ cwd: fixturesDir });
      expect(files.length).toBeGreaterThan(0);
      expect(files).toContain("sample.ts");
      expect(files).toContain("sample.py");
      expect(files).toContain("sample.go");
    });

    it("filters by extension", async () => {
      const files = await findFiles({
        cwd: fixturesDir,
        extensions: [".ts"],
      });
      expect(files.every((f) => f.endsWith(".ts"))).toBe(true);
    });

    it("respects ignore patterns", async () => {
      const files = await findFiles({
        cwd: fixturesDir,
        ignorePatterns: ["*.py"],
      });
      expect(files.some((f) => f.endsWith(".py"))).toBe(false);
    });

    it("normalizes simple directory names in ignore patterns", async () => {
      // Use the src directory which has subdirectories like tools, utils
      const srcDir = resolve(import.meta.dirname, "..");
      const withTools = await findFiles({ cwd: srcDir });
      const withoutTools = await findFiles({
        cwd: srcDir,
        ignorePatterns: ["tools"],
      });

      // Should have fewer files when tools is excluded
      expect(withTools.some((f) => f.startsWith("tools/"))).toBe(true);
      expect(withoutTools.some((f) => f.startsWith("tools/"))).toBe(false);
      expect(withoutTools.length).toBeLessThan(withTools.length);
    });

    it("returns sorted list", async () => {
      const files = await findFiles({ cwd: fixturesDir });
      const sorted = [...files].sort();
      expect(files).toEqual(sorted);
    });
  });
});

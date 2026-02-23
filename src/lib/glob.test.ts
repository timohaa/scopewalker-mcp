import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { findFiles, findEntries } from "./glob.js";

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

  describe("findEntries", () => {
    it("returns both files and directories", async () => {
      const result = await findEntries({ cwd: resolve(import.meta.dirname, "..") });
      expect(result.files.length).toBeGreaterThan(0);
      // Should find subdirectories like tools, types, utils, lib
      expect(result.directories).toContain("tools");
      expect(result.directories).toContain("types");
      expect(result.directories).toContain("utils");
    });

    it("respects maxDepth option", async () => {
      const deep = await findEntries({ cwd: resolve(import.meta.dirname, ".."), maxDepth: 1 });
      const shallow = await findEntries({ cwd: resolve(import.meta.dirname, ".."), maxDepth: 0 });
      // maxDepth: 0 means only the immediate contents
      expect(shallow.files.length).toBeLessThanOrEqual(deep.files.length);
    });

    it("normalizes simple directory names in ignore patterns", async () => {
      const srcDir = resolve(import.meta.dirname, "..");
      const withUtils = await findEntries({ cwd: srcDir });
      const withoutUtils = await findEntries({
        cwd: srcDir,
        ignorePatterns: ["utils"],
      });

      expect(withUtils.directories).toContain("utils");
      expect(withoutUtils.directories).not.toContain("utils");
      expect(withUtils.files.some((f) => f.startsWith("utils/"))).toBe(true);
      expect(withoutUtils.files.some((f) => f.startsWith("utils/"))).toBe(false);
    });
  });
});

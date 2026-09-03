import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
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

  describe("symlink confinement", () => {
    let tempDir: string;
    let root: string;

    beforeAll(async () => {
      tempDir = await mkdtemp(join(tmpdir(), "glob-symlink-"));
      root = join(tempDir, "root");

      await mkdir(join(tempDir, "outside"), { recursive: true });
      await writeFile(join(tempDir, "outside", "secret.ts"), "// secret\n");

      await mkdir(join(root, "sub"), { recursive: true });
      await writeFile(join(root, "real.ts"), "// real\n");

      // Symlink to a file outside the scanned root.
      await symlink(join("..", "outside", "secret.ts"), join(root, "leak.ts"));
      // Symlink to a directory outside the scanned root.
      await symlink(join("..", "outside"), join(root, "leakdir"));
      // Symlink cycling back to the parent directory.
      await symlink("..", join(root, "sub", "cycle"));
    });

    afterAll(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it("excludes symlinked files and directories", async () => {
      const files = await findFiles({ cwd: root });
      expect(files).toEqual(["real.ts"]);
    });

    it("does not hang or throw on a symlink cycle", async () => {
      await expect(findFiles({ cwd: root })).resolves.toBeDefined();
    });

    it("ignores extension entries that would escape the scanned root", async () => {
      const files = await findFiles({
        cwd: root,
        extensions: ["ts,../../outside/*"],
      });
      expect(files.some((f) => f.includes("outside") || f.includes("secret"))).toBe(false);

      const unfilteredBehavior = await findFiles({ cwd: root, extensions: ["}{"] });
      expect(unfilteredBehavior).toEqual(["real.ts"]);
    });
  });
});

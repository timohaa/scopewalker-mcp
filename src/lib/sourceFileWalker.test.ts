import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DEFAULT_MAX_FILE_BYTES } from "../utils/fileGuards.js";
import { walkSourceFiles } from "./sourceFileWalker.js";

let testDir: string;

/** Collects the relative paths the walker yields, which is what the callers key off. */
async function walkedPaths(filePaths: string[], maxFiles?: number): Promise<string[]> {
  const seen: string[] = [];
  for await (const file of walkSourceFiles(filePaths, testDir, true, maxFiles)) {
    seen.push(file.relativePath);
  }
  return seen;
}

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-walker-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });

  await writeFile(join(testDir, "README.md"), "# not a supported language\n");
  await writeFile(join(testDir, "notes.txt"), "also unsupported\n");
  await writeFile(join(testDir, "a.ts"), "export function a(): void {}\n");
  await writeFile(join(testDir, "b.ts"), "export function b(): void {}\n");
  await writeFile(join(testDir, "c.ts"), "export function c(): void {}\n");
  // Comfortably past the 1MB guard so the walker skips it without reading it in.
  await writeFile(join(testDir, "huge.ts"), `// ${"x".repeat(DEFAULT_MAX_FILE_BYTES + 1)}\n`);
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("walkSourceFiles", () => {
  it("yields only files with a detectable language", async () => {
    const seen = await walkedPaths(["README.md", "notes.txt", "a.ts"]);
    expect(seen).toEqual(["a.ts"]);
  });

  it("skips files over the size guard", async () => {
    const seen = await walkedPaths(["huge.ts", "a.ts"]);
    expect(seen).toEqual(["a.ts"]);
  });

  it("skips unreadable paths instead of throwing", async () => {
    const seen = await walkedPaths(["missing.ts", "a.ts"]);
    expect(seen).toEqual(["a.ts"]);
  });

  it("yields every file when maxFiles is undefined", async () => {
    const seen = await walkedPaths(["a.ts", "b.ts", "c.ts"]);
    expect(seen).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("yields every file when maxFiles exceeds the analyzable count", async () => {
    const seen = await walkedPaths(["a.ts", "b.ts"], 99);
    expect(seen).toEqual(["a.ts", "b.ts"]);
  });

  it("caps the number of files yielded", async () => {
    const seen = await walkedPaths(["a.ts", "b.ts", "c.ts"], 2);
    expect(seen).toEqual(["a.ts", "b.ts"]);
  });

  // The bug this parameter exists to fix: a leading non-source file used to consume
  // the caller's max_files budget, so max_files: 1 analyzed nothing at all.
  it("does not spend the cap on files it cannot analyze", async () => {
    const seen = await walkedPaths(["README.md", "notes.txt", "a.ts", "b.ts"], 1);
    expect(seen).toEqual(["a.ts"]);
  });

  it("does not spend the cap on oversized or unreadable files", async () => {
    const seen = await walkedPaths(["huge.ts", "missing.ts", "a.ts"], 1);
    expect(seen).toEqual(["a.ts"]);
  });

  it("stops reading once the cap is reached", async () => {
    // "missing.ts" sits past the cap: reaching it at all would mean the generator
    // kept walking after it had enough, which a lazy stop must not do.
    const seen = await walkedPaths(["a.ts", "missing.ts"], 1);
    expect(seen).toEqual(["a.ts"]);
  });

  it("treats a non-positive cap as no cap", async () => {
    const seen = await walkedPaths(["a.ts", "b.ts"], 0);
    expect(seen).toEqual(["a.ts", "b.ts"]);
  });

  it("reports absolute paths as-is when not scanning a directory", async () => {
    const absolute = join(testDir, "a.ts");
    const seen: string[] = [];
    for await (const file of walkSourceFiles([absolute], testDir, false)) {
      seen.push(file.relativePath);
    }
    expect(seen).toEqual([absolute]);
  });
});

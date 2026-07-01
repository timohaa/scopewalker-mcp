import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { isFileWithinSizeLimit } from "./fileGuards.js";

let testDir: string;

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-fileguards-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });
  await writeFile(join(testDir, "small.txt"), "hello world");
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("isFileWithinSizeLimit", () => {
  it("returns true for a file under the size cap", async () => {
    const result = await isFileWithinSizeLimit(join(testDir, "small.txt"));
    expect(result).toBe(true);
  });

  it("returns false for a file exceeding a custom size cap", async () => {
    const result = await isFileWithinSizeLimit(join(testDir, "small.txt"), 5);
    expect(result).toBe(false);
  });

  it("returns false for a directory", async () => {
    const result = await isFileWithinSizeLimit(testDir);
    expect(result).toBe(false);
  });

  it("returns false for a nonexistent path", async () => {
    const result = await isFileWithinSizeLimit(join(testDir, "missing.txt"));
    expect(result).toBe(false);
  });
});

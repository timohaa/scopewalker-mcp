import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { DeadCodeResult } from "../types/index.js";
import { registerDeadCodeTool } from "./deadCode.js";

const handler = getToolHandler(registerDeadCodeTool, "find_dead_code");

let rootDir: string;

beforeAll(async () => {
  rootDir = join(tmpdir(), `scopewalker-dead-mechanics-${String(Date.now())}`);

  await mkdir(join(rootDir, "limit"), { recursive: true });
  await writeFile(
    join(rootDir, "limit", "manyExports.ts"),
    `import { strict as assert } from "node:assert";

function localA() {}
function localB() {}
function localC() {}

export function pubA() {}
export function pubB() {}
export function pubC() {}
`
  );

  await mkdir(join(rootDir, "summary"), { recursive: true });
  await writeFile(
    join(rootDir, "summary", "summary.ts"),
    `import { strict as assert } from "node:assert";

function keepLocal() {}

function usedLocal() {
  return 1;
}
usedLocal();

export function keepExported() {}
`
  );

  await mkdir(join(rootDir, "singlefile"), { recursive: true });
  await writeFile(
    join(rootDir, "singlefile", "lonely.ts"),
    `import { strict as assert } from "node:assert";

function localOnly() {
  return 1;
}
`
  );

  await mkdir(join(rootDir, "maxfiles"), { recursive: true });
  await writeFile(
    join(rootDir, "maxfiles", "fileA.ts"),
    `import { strict as assert } from "node:assert";

function willMiss() {}
`
  );
  await writeFile(
    join(rootDir, "maxfiles", "fileB.ts"),
    `import { strict as assert } from "node:assert";

function alsoMiss() {}
`
  );
});

afterAll(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

/**
 * Cases about the tool's plumbing (limits, paths, incomplete scans) rather than
 * how any one language's symbols are classified.
 */
describe("find_dead_code - scan mechanics", () => {
  it("applies limit to each list independently while summary counts the full lists", async () => {
    const response = await handler({ path: join(rootDir, "limit"), limit: 1 });
    const result = parseContent<DeadCodeResult>(response);

    expect(result.dead_code).toHaveLength(1);
    expect(result.unreferenced_exports).toHaveLength(1);
    expect(result.summary.dead_code_found).toBe(3);
    expect(result.summary.unreferenced_exports_found).toBe(3);
  });

  it("reports summary counts that match the scan", async () => {
    const response = await handler({ path: join(rootDir, "summary"), limit: 100 });
    const result = parseContent<DeadCodeResult>(response);

    expect(result.summary).toEqual({
      files_scanned: 1,
      files_skipped: 0,
      scan_complete: true,
      symbols_checked: 3,
      dead_code_found: 1,
      unreferenced_exports_found: 1,
    });
  });

  it("scans a single file when given a file path, reporting is_directory false", async () => {
    const response = await handler({
      path: join(rootDir, "singlefile", "lonely.ts"),
      limit: 100,
    });
    const result = parseContent<DeadCodeResult>(response);

    expect(result.is_directory).toBe(false);
    expect(result.dead_code).toContainEqual(
      expect.objectContaining({ name: "localOnly", file: result.path })
    );
  });

  it("returns an error response for a path that does not exist", async () => {
    const response = await handler({ path: join(rootDir, "does-not-exist") });
    expect(response.isError).toBe(true);
  });

  it("marks the scan incomplete and withholds dead_code when max_files is smaller than the file count", async () => {
    const response = await handler({
      path: join(rootDir, "maxfiles"),
      limit: 100,
      max_files: 1,
    });
    const result = parseContent<DeadCodeResult>(response);

    expect(result.summary.scan_complete).toBe(false);
    expect(result.summary.files_skipped).toBeGreaterThan(0);
    expect(result.dead_code).toEqual([]);
    expect(result.unreferenced_exports.length).toBeGreaterThan(0);
  });
});

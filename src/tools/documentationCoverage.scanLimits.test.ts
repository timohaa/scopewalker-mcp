import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { DocumentationCoverageResult } from "../types/index.js";
import { registerDocumentationCoverageTool } from "./documentationCoverage.js";

/**
 * Files over the 1 MB guard are dropped before parsing. Reporting the resulting
 * empty scan as 100% documented hid the gap, so the summary now says how many
 * files the percentage leaves out.
 */
describe("documentationCoverage - skipped files", () => {
  let testDir: string;
  const handler = getToolHandler(registerDocumentationCoverageTool, "get_documentation_coverage");

  beforeAll(async () => {
    testDir = join(tmpdir(), `scopewalker-doc-limits-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });

    const filler = "// padding\n".repeat(100_000);
    await writeFile(join(testDir, "huge.ts"), `${filler}export function undocumented(): void {}\n`);

    await writeFile(join(testDir, "small.ts"), `export function alsoUndocumented(): void {}\n`);
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("does not report an oversized single file as fully documented", async () => {
    const response = await handler({ path: join(testDir, "huge.ts") });
    const result = parseContent<DocumentationCoverageResult>(response);

    expect(result.summary.files_analyzed).toBe(0);
    expect(result.summary.files_skipped).toBe(1);
    expect(result.summary.scan_complete).toBe(false);
    expect(result.coverage.percentage).not.toBe(100);
  });

  it("counts the oversized file as skipped while reporting the rest", async () => {
    const response = await handler({ path: testDir });
    const result = parseContent<DocumentationCoverageResult>(response);

    expect(result.summary.files_analyzed).toBe(1);
    expect(result.summary.files_skipped).toBe(1);
    expect(result.summary.scan_complete).toBe(false);
    expect(result.undocumented_items.map((item) => item.name)).toEqual(["alsoUndocumented"]);
  });

  it("reports a complete scan when every supported file was parsed", async () => {
    const response = await handler({ path: join(testDir, "small.ts") });
    const result = parseContent<DocumentationCoverageResult>(response);

    expect(result.summary.files_skipped).toBe(0);
    expect(result.summary.scan_complete).toBe(true);
  });
});

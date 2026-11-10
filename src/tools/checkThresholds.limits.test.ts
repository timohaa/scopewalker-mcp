import { mkdir, rm, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { analyze } from "../lib/tokei.js";
import type * as tokeiModule from "../lib/tokei.js";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { CheckThresholdsResult } from "../types/index.js";
import { registerCheckThresholdsTool } from "./checkThresholds.js";

vi.mock("../lib/tokei.js", async (importOriginal) => {
  const actual = await importOriginal<typeof tokeiModule>();
  return { ...actual, analyze: vi.fn(actual.analyze) };
});

let testDir: string;
const handler = getToolHandler(registerCheckThresholdsTool, "check_thresholds");
const analyzeMock = vi.mocked(analyze);

beforeAll(async () => {
  const tempPath = join(tmpdir(), `scopewalker-thresh-limits-test-${String(Date.now())}`);
  await mkdir(tempPath, { recursive: true });
  testDir = await realpath(tempPath);

  await writeFile(
    join(testDir, "small.ts"),
    `export const x = 1;
export const y = 2;
`
  );

  // 325-line file holding one 325-line function
  const longFunctionLines = Array.from(
    { length: 322 },
    (_, i) => `  const line${String(i)} = ${String(i)};`
  );
  await writeFile(
    join(testDir, "bigFunc.ts"),
    `export function oversizedFunction() {
${longFunctionLines.join("\n")}
  return line0;
}
`
  );

  // 315-line file holding one 315-line function
  const anotherLongFunc = Array.from(
    { length: 312 },
    (_, i) => `  const val${String(i)} = ${String(i)};`
  );
  await writeFile(
    join(testDir, "anotherBig.ts"),
    `export function anotherOversizedFunction() {
${anotherLongFunc.join("\n")}
  return val0;
}
`
  );

  // Unsupported language file
  await writeFile(
    join(testDir, "data.txt"),
    `This is a plain text file.
It has multiple lines.
But no functions to parse.
`
  );
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

beforeEach(() => {
  analyzeMock.mockClear();
});

describe("single-file path handling", () => {
  it("handles single file path", async () => {
    const response = await handler({ path: join(testDir, "bigFunc.ts") });
    const result = parseContent(response) as CheckThresholdsResult;

    expect(result.violations.oversized_files).toHaveLength(1);
    expect(result.violations.oversized_functions).toHaveLength(1);
    expect(result.summary.files_checked).toBe(1);
  });

  it("reports the skip when the scanned path is itself an oversized file", async () => {
    const dir = join(tmpdir(), `scopewalker-thresh-huge-single-${String(Date.now())}`);
    await mkdir(dir, { recursive: true });
    const hugeFilePath = join(await realpath(dir), "huge.ts");
    await writeFile(hugeFilePath, `export function big() {\n${"x".repeat(1024 * 1024 + 1)}\n}\n`);

    const response = await handler({ path: hugeFilePath });
    const result = parseContent(response) as CheckThresholdsResult;

    expect(result.violations.oversized_functions).toHaveLength(0);
    expect(result.summary.files_skipped).toBe(1);
    expect(result.summary.scan_complete).toBe(false);

    await rm(dir, { recursive: true, force: true });
  });
});

describe("limits and unsupported files", () => {
  it("respects limit parameter for violations", async () => {
    const response = await handler({ path: testDir, limit: 1 });
    const result = parseContent(response) as CheckThresholdsResult;

    // Should only return 1 violation even though there are 2 oversized files
    expect(result.violations.oversized_files).toHaveLength(1);
    // The one returned should be the largest (bigFunc.ts with 325 lines)
    expect(result.violations.oversized_files[0]?.path).toBe("bigFunc.ts");
  });

  it("returns error for nonexistent path", async () => {
    const response = await handler({ path: join(testDir, "nonexistent-12345") });
    expect(response.isError).toBe(true);

    const errorPayload = parseContent(response) as { error: { code: string } };
    expect(errorPayload.error.code).toBe("PATH_NOT_FOUND");
  });

  it("caps scanned files with max_files", async () => {
    const full = await handler({ path: testDir });
    const fullResult = parseContent(full) as CheckThresholdsResult;

    const response = await handler({ path: testDir, max_files: 1 });
    const result = parseContent(response) as CheckThresholdsResult;

    // files_checked comes from tokei (unaffected by max_files); functions_checked
    // is scanned from the max_files-limited file list, so it drops.
    expect(result.summary.files_checked).toBe(fullResult.summary.files_checked);
    expect(result.summary.functions_checked).toBeLessThan(fullResult.summary.functions_checked);
  });

  it("skips unsupported language files for function analysis", async () => {
    const response = await handler({ path: testDir });
    const result = parseContent(response) as CheckThresholdsResult;

    // data.txt should be checked for file size but not for functions
    expect(result.summary.files_checked).toBe(4);
    // It's only 4 lines so won't appear in oversized_files
    const txtViolation = result.violations.oversized_files.find((f) => f.path.endsWith("data.txt"));
    expect(txtViolation).toBeUndefined();

    // No function violations from txt file
    const txtFuncViolation = result.violations.oversized_functions.find((f) =>
      f.path.endsWith("data.txt")
    );
    expect(txtFuncViolation).toBeUndefined();
  });
});

import { mkdir, rm, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { analyze } from "../lib/tokei.js";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { CheckThresholdsResult } from "../types/index.js";
import { createError } from "../utils/errors.js";
import { registerCheckThresholdsTool } from "./checkThresholds.js";

vi.mock("../lib/tokei.js", () => ({
  analyze: vi.fn(),
}));

let testDir: string;
const handler = getToolHandler(registerCheckThresholdsTool, "check_thresholds");
const analyzeMock = vi.mocked(analyze);

beforeAll(async () => {
  const tempPath = join(tmpdir(), `scopewalker-thresh-test-${String(Date.now())}`);
  await mkdir(tempPath, { recursive: true });
  testDir = await realpath(tempPath);

  await writeFile(
    join(testDir, "small.ts"),
    `export const x = 1;
export const y = 2;
`
  );

  // File with a large function (>100 lines)
  const longFunctionLines = Array.from(
    { length: 120 },
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

  // Second large function for testing limit
  const anotherLongFunc = Array.from(
    { length: 110 },
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
  analyzeMock.mockReset();
  analyzeMock.mockResolvedValue({
    success: true,
    data: {
      TypeScript: {
        blanks: 0,
        code: 0,
        comments: 0,
        reports: [
          {
            name: join(testDir, "small.ts"),
            stats: { blanks: 1, code: 2, comments: 0 },
          },
          {
            name: join(testDir, "bigFunc.ts"),
            stats: { blanks: 10, code: 310, comments: 5 },
          },
          {
            name: join(testDir, "anotherBig.ts"),
            stats: { blanks: 8, code: 305, comments: 2 },
          },
        ],
      },
      Text: {
        blanks: 0,
        code: 0,
        comments: 0,
        reports: [
          {
            name: join(testDir, "data.txt"),
            stats: { blanks: 0, code: 4, comments: 0 },
          },
        ],
      },
    },
  });
});

describe("violation detection", () => {
  it("flags oversized files and functions", async () => {
    const response = await handler({ path: testDir });
    const result = parseContent<CheckThresholdsResult>(response);

    // Both bigFunc.ts (325 lines) and anotherBig.ts (315 lines) exceed 300 line threshold
    expect(result.violations.oversized_files).toHaveLength(2);
    expect(result.violations.oversized_files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "bigFunc.ts",
          lines: 325,
          exceeds_by: 25,
        }),
        expect.objectContaining({
          path: "anotherBig.ts",
          lines: 315,
          exceeds_by: 15,
        }),
      ])
    );
    // Both files have oversized functions (>100 lines)
    expect(result.violations.oversized_functions.length).toBeGreaterThanOrEqual(2);
    expect(
      result.violations.oversized_functions.some((f) => f.function_name === "oversizedFunction")
    ).toBe(true);
    expect(
      result.violations.oversized_functions.some(
        (f) => f.function_name === "anotherOversizedFunction"
      )
    ).toBe(true);
    expect(result.summary.file_violations).toBe(2);
    expect(result.summary.function_violations).toBeGreaterThanOrEqual(2);
  });

  it("returns errors from the line counter", async () => {
    analyzeMock.mockResolvedValueOnce({
      success: false,
      error: createError("TOOL_NOT_AVAILABLE", "tokei missing"),
    });

    const response = await handler({ path: testDir });
    expect(response.isError).toBe(true);

    const errorPayload = parseContent<{ error: { code: string } }>(response);
    expect(errorPayload.error.code).toBe("TOOL_NOT_AVAILABLE");
  });

  it("forwards include_hidden to the tokei analyzer", async () => {
    await handler({ path: testDir, include_hidden: true });
    expect(analyzeMock).toHaveBeenCalledWith(
      testDir,
      expect.objectContaining({ includeHidden: true })
    );
  });

  it("strips a leading dot from extensions before forwarding to the analyzer", async () => {
    await handler({ path: testDir, extensions: [".ts", "js"] });
    expect(analyzeMock).toHaveBeenCalledWith(
      testDir,
      expect.objectContaining({ extensions: ["ts", "js"] })
    );
  });
});

describe("function-pass skip reporting (M10)", () => {
  it("reports scan_complete=true and files_skipped=0 when nothing was dropped", async () => {
    const response = await handler({ path: testDir });
    const result = parseContent<CheckThresholdsResult>(response);

    expect(result.summary.files_skipped).toBe(0);
    expect(result.summary.scan_complete).toBe(true);
  });

  it("reports files_skipped and scan_complete=false when the 1MB guard drops a file", async () => {
    const dir = join(tmpdir(), `scopewalker-thresh-huge-${String(Date.now())}`);
    await mkdir(dir, { recursive: true });
    const resolvedDir = await realpath(dir);
    const hugeFilePath = join(resolvedDir, "huge.ts");
    // A single-function file over the 1MB AST size guard, so walkSourceFiles
    // silently drops it from the function pass (M10: this used to be invisible).
    // It lives in its own directory so it can't be mistaken for the shared
    // testDir's already-oversized bigFunc.ts / anotherBig.ts functions.
    await writeFile(hugeFilePath, `export function big() {\n${"x".repeat(1024 * 1024 + 1)}\n}\n`);

    analyzeMock.mockResolvedValueOnce({
      success: true,
      data: {
        TypeScript: {
          blanks: 0,
          code: 0,
          comments: 0,
          reports: [{ name: hugeFilePath, stats: { blanks: 0, code: 60_002, comments: 0 } }],
        },
      },
    });

    const response = await handler({ path: resolvedDir });
    const result = parseContent<CheckThresholdsResult>(response);

    expect(result.violations.oversized_functions).toHaveLength(0);
    expect(result.summary.files_skipped).toBe(1);
    expect(result.summary.scan_complete).toBe(false);

    await rm(resolvedDir, { recursive: true, force: true });
  });
});

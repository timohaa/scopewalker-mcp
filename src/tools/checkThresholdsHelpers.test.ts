import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { TokeiOutput } from "../lib/tokei.js";
import {
  findOversizedFiles,
  findOversizedFunctions,
  sortAndLimitViolations,
  buildCheckThresholdsResult,
} from "./checkThresholdsHelpers.js";

describe("findOversizedFiles", () => {
  it("flags files exceeding the line threshold and records all line counts", () => {
    const tokeiData: TokeiOutput = {
      TypeScript: {
        blanks: 0,
        code: 0,
        comments: 0,
        reports: [
          { name: "/repo/small.ts", stats: { blanks: 1, code: 2, comments: 0 } },
          { name: "/repo/big.ts", stats: { blanks: 10, code: 300, comments: 5 } },
        ],
      },
    };

    const { oversizedFiles, fileLineCounts } = findOversizedFiles(tokeiData, "/repo", 100);

    expect(oversizedFiles).toEqual([{ path: "big.ts", lines: 315, exceeds_by: 215 }]);
    expect(fileLineCounts.get("/repo/small.ts")).toBe(3);
    expect(fileLineCounts.get("/repo/big.ts")).toBe(315);
  });
});

describe("findOversizedFunctions", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `scopewalker-thresh-helpers-test-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, "small.ts"), "export function tiny() { return 1; }\n");
    // A file large enough to exceed the default 1MB size guard.
    await writeFile(
      join(testDir, "huge.ts"),
      `export function huge() {\n${"x".repeat(1024 * 1024 + 1)}\n}\n`
    );
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("skips files exceeding the size guard, and reports the skip (M10)", async () => {
    const { oversizedFunctions, totalFunctions, filesSkipped } = await findOversizedFunctions(
      ["huge.ts"],
      testDir,
      true,
      100
    );

    expect(totalFunctions).toBe(0);
    expect(oversizedFunctions).toHaveLength(0);
    // huge.ts is a real, analyzable TS file that the size guard silently drops.
    expect(filesSkipped).toBe(1);
  });

  it("counts functions within the size guard and reports no skips", async () => {
    const { totalFunctions, filesSkipped } = await findOversizedFunctions(
      ["small.ts"],
      testDir,
      true,
      100
    );

    expect(totalFunctions).toBeGreaterThanOrEqual(1);
    expect(filesSkipped).toBe(0);
  });

  it("silently skips files that can't be read, and counts them as skipped too", async () => {
    // detectLanguage works from the path alone, so a missing file still counts
    // as analyzable; walkSourceFiles then drops it when the read fails, and
    // the same filesSkipped accounting (countAnalyzable - filesScanned) catches it.
    const { oversizedFunctions, totalFunctions, filesSkipped } = await findOversizedFunctions(
      ["missing.ts"],
      testDir,
      true,
      100
    );

    expect(totalFunctions).toBe(0);
    expect(oversizedFunctions).toHaveLength(0);
    expect(filesSkipped).toBe(1);
  });

  it("reports zero files skipped for a single-file (non-directory) scan", async () => {
    const { filesSkipped } = await findOversizedFunctions(
      [join(testDir, "small.ts")],
      testDir,
      false,
      100
    );

    expect(filesSkipped).toBe(0);
  });
});

describe("sortAndLimitViolations", () => {
  const violations = [{ lines: 10 }, { lines: 30 }, { lines: 20 }];

  it("sorts by line count descending", () => {
    const sorted = sortAndLimitViolations(violations);
    expect(sorted.map((v) => v.lines)).toEqual([30, 20, 10]);
  });

  it("applies a limit when provided", () => {
    const limited = sortAndLimitViolations(violations, 2);
    expect(limited.map((v) => v.lines)).toEqual([30, 20]);
  });

  it("returns all sorted violations when no limit is given", () => {
    const result = sortAndLimitViolations(violations, undefined);
    expect(result).toHaveLength(3);
  });
});

describe("buildCheckThresholdsResult", () => {
  it("assembles config, violations, and stats into the result shape", () => {
    const result = buildCheckThresholdsResult(
      { resolvedPath: "/repo", maxFileLines: 300, maxFunctionLines: 100 },
      {
        oversizedFiles: [{ path: "big.ts", lines: 400, exceeds_by: 100 }],
        oversizedFunctions: [],
        totalFileViolations: 1,
        totalFunctionViolations: 0,
      },
      { filesChecked: 5, totalFunctions: 12, filesSkipped: 0, scanComplete: true }
    );

    expect(result).toEqual({
      path: "/repo",
      thresholds: { max_file_lines: 300, max_function_lines: 100 },
      violations: {
        oversized_files: [{ path: "big.ts", lines: 400, exceeds_by: 100 }],
        oversized_functions: [],
      },
      summary: {
        files_checked: 5,
        functions_checked: 12,
        file_violations: 1,
        function_violations: 0,
        files_skipped: 0,
        scan_complete: true,
      },
    });
  });

  it("marks the scan incomplete when the function pass skipped files (M10)", () => {
    const result = buildCheckThresholdsResult(
      { resolvedPath: "/repo", maxFileLines: 300, maxFunctionLines: 100 },
      {
        oversizedFiles: [],
        oversizedFunctions: [],
        totalFileViolations: 0,
        totalFunctionViolations: 0,
      },
      { filesChecked: 5, totalFunctions: 12, filesSkipped: 2, scanComplete: false }
    );

    expect(result.summary.files_skipped).toBe(2);
    expect(result.summary.scan_complete).toBe(false);
  });
});

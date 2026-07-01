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

  it("skips files exceeding the size guard", async () => {
    const { oversizedFunctions, totalFunctions } = await findOversizedFunctions(
      ["huge.ts"],
      testDir,
      true,
      100
    );

    expect(totalFunctions).toBe(0);
    expect(oversizedFunctions).toHaveLength(0);
  });

  it("counts functions within the size guard", async () => {
    const { totalFunctions } = await findOversizedFunctions(["small.ts"], testDir, true, 100);

    expect(totalFunctions).toBeGreaterThanOrEqual(1);
  });

  it("silently skips files that can't be read", async () => {
    const { oversizedFunctions, totalFunctions } = await findOversizedFunctions(
      ["missing.ts"],
      testDir,
      true,
      100
    );

    expect(totalFunctions).toBe(0);
    expect(oversizedFunctions).toHaveLength(0);
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
      { filesChecked: 5, totalFunctions: 12 }
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
      },
    });
  });
});

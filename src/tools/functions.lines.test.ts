import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { FunctionLineCountsResult } from "../types/index.js";
import { registerFunctionsTool } from "./functions.js";

let testDir: string;
const linesHandler = getToolHandler(registerFunctionsTool, "get_functions");
/** Invokes get_functions in lines mode, matching the per-function metrics this suite covers. */
const handler = (args: Record<string, unknown>): ReturnType<typeof linesHandler> =>
  linesHandler({ ...args, detail: "lines" });

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-funclines-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });

  // app.ts has small functions
  await writeFile(
    join(testDir, "app.ts"),
    `export function shortFunc() {
  return 1;
}

export function mediumFunc(x: number): number {
  const a = x + 1;
  const b = a * 2;
  const c = b - 1;
  const d = c + 10;
  return d;
}

export function longFunc() {
  const line1 = 1;
  const line2 = 2;
  const line3 = 3;
  const line4 = 4;
  const line5 = 5;
  const line6 = 6;
  const line7 = 7;
  const line8 = 8;
  const line9 = 9;
  const line10 = 10;
  const line11 = 11;
  const line12 = 12;
  return line1 + line12;
}
`
  );

  // Generate a file with a large function (>50 lines) to test functionsOver50
  const bigFunctionLines = Array.from(
    { length: 55 },
    (_, i) => `  const v${String(i)} = ${String(i)};`
  ).join("\n");
  await writeFile(
    join(testDir, "big.ts"),
    `export function bigFunction() {\n${bigFunctionLines}\n  return v0;\n}\n`
  );

  // another.ts has a medium-sized largest function
  await writeFile(
    join(testDir, "another.ts"),
    `export function anotherFunc() {
  const x = 1;
  const y = 2;
  const z = 3;
  return x + y + z;
}
`
  );
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("sorting behavior", () => {
  it("returns per-function line counts ordered by size", async () => {
    const response = await handler({ path: join(testDir, "app.ts") });
    const result = parseContent<FunctionLineCountsResult>(response);

    const file = result.files.find((entry) => entry.path.endsWith("app.ts"));
    const namedFunctions = file?.functions.filter((fn) => fn.name !== "<anonymous>");

    expect(namedFunctions?.map((fn) => fn.name)).toEqual(["longFunc", "mediumFunc", "shortFunc"]);
    expect(result.summary.total_functions).toBeGreaterThanOrEqual(3);
    expect(result.summary.largest_function?.name).toBe("longFunc");
    expect(result.summary.functions_over_50_lines).toBe(0);
  });

  it("sorts functions by name when sort_by is 'name'", async () => {
    const response = await handler({ path: testDir, sort_by: "name" });
    const result = parseContent<FunctionLineCountsResult>(response);

    const file = result.files.find((entry) => entry.path.endsWith("app.ts"));
    const namedFunctions = file?.functions.filter((fn) => fn.name !== "<anonymous>");

    expect(namedFunctions?.map((fn) => fn.name)).toEqual(["longFunc", "mediumFunc", "shortFunc"]);
  });

  it("sorts functions ascending when sort_by is 'lines_asc'", async () => {
    const response = await handler({ path: testDir, sort_by: "lines_asc" });
    const result = parseContent<FunctionLineCountsResult>(response);

    const file = result.files.find((entry) => entry.path.endsWith("app.ts"));
    const namedFunctions = file?.functions.filter((fn) => fn.name !== "<anonymous>");

    expect(namedFunctions?.map((fn) => fn.name)).toEqual(["shortFunc", "mediumFunc", "longFunc"]);
  });

  it("sorts files by largest function ascending with lines_asc", async () => {
    const response = await handler({ path: testDir, sort_by: "lines_asc" });
    const result = parseContent<FunctionLineCountsResult>(response);

    // Files should be sorted by their largest function, ascending
    // another.ts (6 lines) < app.ts (14 lines) < big.ts (57 lines)
    const filePaths = result.files.map((f) => f.path);
    const anotherIdx = filePaths.findIndex((p) => p.includes("another"));
    const appIdx = filePaths.findIndex((p) => p.includes("app"));
    const bigIdx = filePaths.findIndex((p) => p.includes("big"));

    expect(anotherIdx).toBeLessThan(appIdx);
    expect(appIdx).toBeLessThan(bigIdx);
  });

  it("sorts files by name correctly", async () => {
    const response = await handler({ path: testDir, sort_by: "name" });
    const result = parseContent<FunctionLineCountsResult>(response);

    const filePaths = result.files.map((f) => f.path);
    const sortedPaths = [...filePaths].sort((a, b) => a.localeCompare(b));
    expect(filePaths).toEqual(sortedPaths);
  });
});

describe("filtering behavior", () => {
  it("filters out short functions when min_lines is provided", async () => {
    const response = await handler({ path: join(testDir, "app.ts"), min_lines: 5 });
    const result = parseContent<FunctionLineCountsResult>(response);

    const file = result.files.find((entry) => entry.path.endsWith("app.ts"));
    expect(file?.functions.map((fn) => fn.name)).toEqual(["longFunc", "mediumFunc"]);
    expect(result.summary.total_functions).toBe(2);
  });

  it("skips unsupported file types", async () => {
    // Create a non-code file
    await writeFile(join(testDir, "data.json"), '{"key": "value"}');

    const response = await handler({ path: testDir });
    const result = parseContent<FunctionLineCountsResult>(response);

    // Should not include JSON file
    const hasJson = result.files.some((f) => f.path.endsWith(".json"));
    expect(hasJson).toBe(false);
  });

  it("handles extension filtering", async () => {
    const response = await handler({ path: testDir, extensions: [".ts"] });
    const result = parseContent<FunctionLineCountsResult>(response);

    // All files should be .ts
    for (const file of result.files) {
      expect(file.path.endsWith(".ts")).toBe(true);
    }
  });

  it("filters by grep keyword matching function names", async () => {
    const response = await handler({ path: testDir, grep: "long" });
    const result = parseContent<FunctionLineCountsResult>(response);

    // Should find longFunc
    const appFile = result.files.find((f) => f.path.endsWith("app.ts"));
    expect(appFile).toBeDefined();
    expect(appFile?.functions.some((fn) => fn.name === "longFunc")).toBe(true);

    // Should not include functions that don't match
    expect(appFile?.functions.some((fn) => fn.name === "shortFunc")).toBe(false);
  });

  it("grep filter matches file paths", async () => {
    const response = await handler({ path: testDir, grep: "big" });
    const result = parseContent<FunctionLineCountsResult>(response);

    // Should include big.ts file (path matches)
    const bigFile = result.files.find((f) => f.path.endsWith("big.ts"));
    expect(bigFile).toBeDefined();
    expect(bigFile?.functions.length).toBeGreaterThan(0);
  });
});

describe("metrics and thresholds", () => {
  it("counts functions over 50 lines correctly", async () => {
    const response = await handler({ path: testDir });
    const result = parseContent<FunctionLineCountsResult>(response);

    // The bigFunction has 57 lines (1 + 55 + 1), so should count as over 50
    expect(result.summary.functions_over_50_lines).toBeGreaterThanOrEqual(1);

    // Verify the big function is the largest
    expect(result.summary.largest_function?.name).toBe("bigFunction");
  });

  it("handles single file path", async () => {
    const response = await handler({ path: join(testDir, "app.ts") });
    const result = parseContent<FunctionLineCountsResult>(response);

    expect(result.is_directory).toBe(false);
    expect(result.files.length).toBe(1);
    expect(result.summary.total_functions).toBeGreaterThanOrEqual(3);
  });
});

describe("line statistics", () => {
  it("counts blank and comment lines within functions", async () => {
    // Create a file with functions containing blanks and comments
    await writeFile(
      join(testDir, "commented.ts"),
      `export function withCommentsAndBlanks() {
  // This is a comment
  const x = 1;

  /* Multi-line
     comment */
  const y = 2;

  return x + y;
}
`
    );

    const response = await handler({ path: join(testDir, "commented.ts") });
    const result = parseContent<FunctionLineCountsResult>(response);

    const file = result.files.find((f) => f.path.includes("commented"));
    const fn = file?.functions.find((f) => f.name === "withCommentsAndBlanks");

    expect(fn).toBeDefined();
    expect(fn?.lines.total).toBeGreaterThanOrEqual(10);
    expect(fn?.lines.blank).toBeGreaterThan(0);
    expect(fn?.lines.comment).toBeGreaterThan(0);
    expect(fn?.lines.code).toBeLessThan(fn?.lines.total ?? 0);
  });

  it("returns error for nonexistent path", async () => {
    const response = await handler({ path: "/nonexistent/path/12345" });
    expect(response.isError).toBe(true);

    const errorPayload = parseContent<{ error: { code: string } }>(response);
    expect(errorPayload.error.code).toBe("PATH_NOT_FOUND");
  });
});

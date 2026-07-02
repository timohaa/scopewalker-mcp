import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { FunctionCountsResult } from "../types/index.js";
import { registerFunctionsTool } from "./functions.js";

let testDir: string;
const handler = getToolHandler(registerFunctionsTool, "get_functions");

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-func-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });

  await writeFile(
    join(testDir, "utils.ts"),
    `export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export class Calculator {
  multiply(a: number, b: number): number {
    return a * b;
  }
}
`
  );

  await writeFile(join(testDir, "README.md"), "# Test");

  // File with no functions - only types and exports
  await writeFile(
    join(testDir, "types.ts"),
    `export interface User {
  name: string;
  age: number;
}

export type Status = "active" | "inactive";

export const DEFAULT_VALUE = 42;
`
  );
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("counting behavior", () => {
  it("returns function counts with language metadata", async () => {
    const response = await handler({ path: testDir, sort_by: "name" });
    const result = parseContent<FunctionCountsResult>(response);

    const tsFile = result.files.find((file) => file.path.endsWith("utils.ts"));

    expect(tsFile?.language).toBe("typescript");
    expect(tsFile?.function_count).toBeGreaterThanOrEqual(3);
    expect(tsFile?.functions.map((fn) => fn.name)).toEqual(
      expect.arrayContaining(["add", "subtract", "multiply"])
    );

    // Unsupported files like .md are skipped entirely to avoid response bloat
    const mdFile = result.files.find((file) => file.path.endsWith("README.md"));
    expect(mdFile).toBeUndefined();
  });

  it("summarizes analyzed files only", async () => {
    const response = await handler({ path: testDir });
    const result = parseContent<FunctionCountsResult>(response);

    expect(result.summary.total_functions).toBeGreaterThanOrEqual(3);
    expect(result.summary.total_files_analyzed).toBe(2);
    expect(result.summary.files_with_no_functions).toBe(1);
  });

  it("counts files with zero functions", async () => {
    const response = await handler({ path: testDir });
    const result = parseContent<FunctionCountsResult>(response);

    const typesFile = result.files.find((file) => file.path.endsWith("types.ts"));
    expect(typesFile?.language).toBe("typescript");
    expect(typesFile?.function_count).toBe(0);
    expect(typesFile?.functions).toEqual([]);
  });

  it("sorts by count ascending", async () => {
    const response = await handler({ path: testDir, sort_by: "count_asc" });
    const result = parseContent<FunctionCountsResult>(response);

    // Only supported language files should be included (unsupported files like .md are skipped)
    const tsFiles = result.files.filter((f) => f.language === "typescript");
    expect(tsFiles.length).toBe(result.files.length); // All files should be TypeScript

    // types.ts has 0 functions, utils.ts has 3+
    expect(tsFiles[0]?.function_count).toBe(0);
    expect(tsFiles[1]?.function_count).toBeGreaterThan(0);

    // Unsupported files like README.md should not be included
    const mdFile = result.files.find((f) => f.path.endsWith("README.md"));
    expect(mdFile).toBeUndefined();
  });
});

describe("path handling and filtering", () => {
  it("handles single file path", async () => {
    const response = await handler({ path: join(testDir, "utils.ts") });
    const result = parseContent<FunctionCountsResult>(response);

    expect(result.is_directory).toBe(false);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.function_count).toBeGreaterThanOrEqual(3);
  });

  it("filters by grep keyword matching function names", async () => {
    const response = await handler({ path: testDir, grep: "add" });
    const result = parseContent<FunctionCountsResult>(response);

    // Should find 'add' function
    const utilsFile = result.files.find((f) => f.path.endsWith("utils.ts"));
    expect(utilsFile).toBeDefined();
    expect(utilsFile?.functions.some((fn) => fn.name === "add")).toBe(true);

    // Should not include functions that don't match
    expect(utilsFile?.functions.some((fn) => fn.name === "multiply")).toBe(false);

    // function_count should reflect filtered count
    expect(utilsFile?.function_count).toBe(1);
  });

  it("grep filter matches file paths", async () => {
    const response = await handler({ path: testDir, grep: "utils" });
    const result = parseContent<FunctionCountsResult>(response);

    // Should include utils.ts file (path matches) with all its functions
    const utilsFile = result.files.find((f) => f.path.endsWith("utils.ts"));
    expect(utilsFile).toBeDefined();
    expect(utilsFile?.function_count).toBeGreaterThanOrEqual(3);
  });
});

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { DocumentationCoverageResult } from "../types/index.js";
import { registerDocumentationCoverageTool } from "./documentationCoverage.js";

let testDir: string;
const handler = getToolHandler(registerDocumentationCoverageTool, "get_documentation_coverage");

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-doc-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });

  // TypeScript file with JSDoc
  await writeFile(
    join(testDir, "documented.ts"),
    `/**
 * Calculates the sum of two numbers.
 * @param a First number
 * @param b Second number
 * @returns The sum
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * User service class
 */
export class UserService {
  /**
   * Gets a user by ID
   */
  getUser(id: string): void {}
}
`
  );

  // TypeScript file without documentation
  await writeFile(
    join(testDir, "undocumented.ts"),
    `export function subtract(a: number, b: number): number {
  return a - b;
}

export class DataService {
  fetch(): void {}
  save(): void {}
}
`
  );
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("documentationCoverage tool", () => {
  it("calculates documentation coverage and lists gaps", async () => {
    const response = await handler({ path: testDir });
    const result = parseContent<DocumentationCoverageResult>(response);

    expect(result.coverage.documented).toBe(3);
    expect(result.coverage.undocumented).toBe(4);
    expect(result.coverage.percentage).toBeCloseTo(42.9, 1);

    expect(result.undocumented_items.map((item) => item.name)).toEqual(
      expect.arrayContaining(["subtract", "DataService", "fetch", "save"])
    );
    expect(result.summary.fully_documented_files).toBe(1);
    expect(result.summary.zero_documentation_files).toBe(1);
  });

  it("returns per-file coverage details", async () => {
    const response = await handler({ path: testDir });
    const result = parseContent<DocumentationCoverageResult>(response);

    const documentedFile = result.by_file.find((file) => file.path.endsWith("documented.ts"));
    const undocumentedFile = result.by_file.find((file) => file.path.endsWith("undocumented.ts"));

    expect(documentedFile?.documented).toBe(3);
    expect(documentedFile?.undocumented).toBe(0);
    expect(undocumentedFile?.documented).toBe(0);
    expect(undocumentedFile?.undocumented).toBe(4);
  });

  it("returns summary only when requested", async () => {
    const response = await handler({ path: testDir, summary_only: true });
    const result = parseContent<DocumentationCoverageResult>(response);

    expect(result.coverage.documented).toBe(3);
    expect(result.coverage.undocumented).toBe(4);
    expect(result.undocumented_items).toHaveLength(0);
  });

  it("respects limit parameter", async () => {
    const response = await handler({ path: testDir, limit: 2 });
    const result = parseContent<DocumentationCoverageResult>(response);

    expect(result.undocumented_items).toHaveLength(2);
    // Total undocumented is still 4, but only 2 items returned
    expect(result.coverage.undocumented).toBe(4);
  });

  it("returns error for nonexistent path", async () => {
    const response = await handler({ path: "/nonexistent/path/12345" });
    expect(response.isError).toBe(true);

    const errorPayload = parseContent<{ error: { code: string } }>(response);
    expect(errorPayload.error.code).toBe("PATH_NOT_FOUND");
  });
});

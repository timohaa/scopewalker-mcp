import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { CodeSmellsResult } from "../types/index.js";
import { registerCodeSmellsTool } from "./codeSmells.js";

const handler = getToolHandler(registerCodeSmellsTool, "get_code_smells");
let testDir: string;

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-smells-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });

  await writeFile(
    join(testDir, "sample.ts"),
    `// TODO: Implement this feature
function notImplemented() {
  // FIXME: This is broken
  throw new Error("Not implemented");
}

// HACK: Workaround for API bug
function workaround() {
  // XXX: This needs review
  return null;
}

// BUG: Known issue #123
// DEPRECATED: Use newFunction instead
function oldFunction() {}
`
  );

  await writeFile(
    join(testDir, "clean.ts"),
    `function cleanCode() {
  return "No smells here";
}
`
  );
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("core functionality", () => {
  it("detects all code smell types", async () => {
    const response = await handler({ path: testDir });
    const result = parseContent<CodeSmellsResult>(response);

    expect(result.is_directory).toBe(true);
    expect(result.summary.total_files_scanned).toBe(2);
    expect(result.summary.files_with_smells).toBe(1);
    expect(result.summary.by_type.todo).toBeGreaterThanOrEqual(1);
    expect(result.summary.by_type.fixme).toBeGreaterThanOrEqual(1);
    expect(result.summary.by_type.hack).toBeGreaterThanOrEqual(1);
    expect(result.summary.by_type.xxx).toBeGreaterThanOrEqual(1);
    expect(result.summary.by_type.bug).toBeGreaterThanOrEqual(1);
    expect(result.summary.by_type.deprecated).toBeGreaterThanOrEqual(1);
  });

  it("returns correct line numbers and text when explicitly requested", async () => {
    const response = await handler({ path: join(testDir, "sample.ts"), include_text: true });
    const result = parseContent<CodeSmellsResult>(response);

    const todoSmell = result.files[0]?.smells.find((s) => s.type === "todo");
    expect(todoSmell).toBeDefined();
    expect(todoSmell?.line).toBe(1);
    expect(todoSmell?.text).toContain("TODO");
  });

  it("redacts comment text by default", async () => {
    const response = await handler({ path: join(testDir, "sample.ts") });
    const result = parseContent<CodeSmellsResult>(response);

    const todoSmell = result.files[0]?.smells.find((s) => s.type === "todo");
    expect(todoSmell?.text).toBe("<redacted>");
  });
});

describe("filtering", () => {
  it("filters by smell type", async () => {
    const response = await handler({
      path: testDir,
      types: ["todo", "fixme"],
    });
    const result = parseContent<CodeSmellsResult>(response);

    expect(result.summary.by_type.todo).toBeGreaterThanOrEqual(1);
    expect(result.summary.by_type.fixme).toBeGreaterThanOrEqual(1);
    // Other types should be 0 since we only searched for TODO and FIXME
    expect(result.summary.by_type.hack).toBe(0);
    expect(result.summary.by_type.xxx).toBe(0);
  });

  it("filters by extension", async () => {
    const response = await handler({
      path: testDir,
      extensions: [".js"], // No .js files exist
    });
    const result = parseContent<CodeSmellsResult>(response);

    expect(result.summary.total_files_scanned).toBe(0);
  });

  it("applies limit parameter correctly", async () => {
    // Create multiple files with smells
    await writeFile(join(testDir, "file1.ts"), "// TODO: task 1\n// FIXME: fix 1");
    await writeFile(join(testDir, "file2.ts"), "// TODO: task 2");
    await writeFile(join(testDir, "file3.ts"), "// HACK: workaround");

    const response = await handler({ path: testDir, limit: 1 });
    const result = parseContent<CodeSmellsResult>(response);

    // Should only return 1 file despite multiple files having smells
    expect(result.files.length).toBe(1);
    // But summary should still reflect all scanned files
    expect(result.summary.files_with_smells).toBeGreaterThan(1);
  });
});

describe("path handling", () => {
  it("handles single file path", async () => {
    const response = await handler({ path: join(testDir, "sample.ts") });
    const result = parseContent<CodeSmellsResult>(response);

    expect(result.is_directory).toBe(false);
    expect(result.summary.total_files_scanned).toBe(1);
    expect(result.files.length).toBe(1);
  });

  it("handles invalid path gracefully", async () => {
    const response = await handler({ path: "/nonexistent/path/to/file.ts" });

    expect(response.isError).toBe(true);
  });
});

describe("edge cases", () => {
  it("ignores false positives in string literals and code", async () => {
    // Create a file with smell keywords in strings and code, not comments
    await writeFile(
      join(testDir, "false_positives.ts"),
      `// This file tests false positive prevention

function parseReport(input: string) {
  // TODO: Real task in comment - this should be detected

  // These should NOT be detected (keywords in strings/code, not comments):
  const label = "Bug fixing and feature work";
  const template = "Format: TICKET-XXX";
  const message = \`Fixing BUG in the system\`;

  if (input.includes("FIXME")) {
    console.log("Found FIXME keyword");
  }

  return { status: "DEPRECATED field" };
}
`
    );

    const response = await handler({ path: join(testDir, "false_positives.ts") });
    const result = parseContent<CodeSmellsResult>(response);

    // Should only find the TODO in the actual comment
    expect(result.summary.total_smells).toBe(1);
    expect(result.summary.by_type.todo).toBe(1);
    expect(result.summary.by_type.bug).toBe(0); // "Bug" in string should not match
    expect(result.summary.by_type.xxx).toBe(0); // "XXX" in string should not match
    expect(result.summary.by_type.fixme).toBe(0); // "FIXME" in code/string should not match
    expect(result.summary.by_type.deprecated).toBe(0); // "DEPRECATED" in string should not match
  });

  it("returns empty results for clean files", async () => {
    const response = await handler({ path: join(testDir, "clean.ts") });
    const result = parseContent<CodeSmellsResult>(response);

    expect(result.summary.total_smells).toBe(0);
    expect(result.files.length).toBe(0);
  });

  it("skips unsupported file types to avoid false positives", async () => {
    // Create a .txt file - not supported by tree-sitter, should be skipped entirely
    // This prevents scanning binary files and non-code files that could produce false positives
    await writeFile(
      join(testDir, "notes.txt"),
      `TODO: Add more documentation
This is a regular line
FIXME: Review this section
Another normal line
HACK: Temporary workaround
`
    );

    const response = await handler({ path: join(testDir, "notes.txt") });
    const result = parseContent<CodeSmellsResult>(response);

    // Unsupported file types should be skipped - no smells detected
    expect(result.summary.total_smells).toBe(0);
    expect(result.files.length).toBe(0);
  });
});

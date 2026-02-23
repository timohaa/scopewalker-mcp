import { mkdir, rm, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { analyze } from "../lib/tokei.js";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { LineCountsResult } from "../types/index.js";
import { createError } from "../utils/errors.js";
import { registerLineCountsTool } from "./lineCounts.js";

vi.mock("../lib/tokei.js", () => ({
  analyze: vi.fn(),
}));

describe("lineCounts tool", () => {
  let testDir: string;
  const analyzeMock = vi.mocked(analyze);
  const handler = getToolHandler(registerLineCountsTool, "get_line_counts");

  beforeAll(async () => {
    const tempPath = join(tmpdir(), `scopewalker-lines-test-${String(Date.now())}`);
    await mkdir(tempPath, { recursive: true });
    testDir = await realpath(tempPath);

    await writeFile(
      join(testDir, "main.ts"),
      `// Comment line
export function main() {
  const x = 1;
  const y = 2;
  return x + y;
}

// Another comment
`
    );

    await writeFile(
      join(testDir, "helper.ts"),
      `export const helper = () => {
  return 42;
};
`
    );
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
              name: join(testDir, "main.ts"),
              stats: { blanks: 2, code: 5, comments: 2 },
            },
            {
              name: join(testDir, "helper.ts"),
              stats: { blanks: 1, code: 2, comments: 1 },
            },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("returns flattened file counts sorted by total lines", async () => {
    const response = await handler({ path: testDir });
    expect(response.isError).toBeUndefined();

    const result = parseContent<LineCountsResult>(response);
    expect(result.files.map((f) => f.path)).toEqual(["main.ts", "helper.ts"]);
    expect(result.files[0].lines.total).toBe(9);
    expect(result.summary.total_lines).toBe(13);
    expect(result.summary.total_files).toBe(2);
  });

  it("supports alternate sorting", async () => {
    const response = await handler({ path: testDir, sort_by: "name" });
    const result = parseContent<LineCountsResult>(response);
    expect(result.files[0].path).toBe("helper.ts");
    expect(result.files[1].path).toBe("main.ts");
  });

  it("surfaces tokei errors from the analyzer", async () => {
    analyzeMock.mockResolvedValueOnce({
      success: false,
      error: createError("TOOL_NOT_AVAILABLE", "missing"),
    });

    const response = await handler({ path: testDir });
    expect(response.isError).toBe(true);

    const errorPayload = parseContent<{ error: { code: string } }>(response);
    expect(errorPayload.error.code).toBe("TOOL_NOT_AVAILABLE");
  });

  it("sorts by lines ascending", async () => {
    const response = await handler({ path: testDir, sort_by: "lines_asc" });
    const result = parseContent<LineCountsResult>(response);

    // helper.ts has 4 lines, main.ts has 9 lines
    expect(result.files[0].path).toBe("helper.ts");
    expect(result.files[1].path).toBe("main.ts");
  });

  it("returns error for nonexistent path", async () => {
    const response = await handler({ path: "/nonexistent/path/12345" });
    expect(response.isError).toBe(true);

    const errorPayload = parseContent<{ error: { code: string } }>(response);
    expect(errorPayload.error.code).toBe("PATH_NOT_FOUND");
  });

  it("filters files by grep keyword", async () => {
    const response = await handler({ path: testDir, grep: "helper" });
    const result = parseContent<LineCountsResult>(response);

    // Should only include helper.ts (matches "helper")
    expect(result.files.length).toBe(1);
    expect(result.files[0].path).toBe("helper.ts");
  });

  it("grep filter is case-insensitive", async () => {
    const response = await handler({ path: testDir, grep: "MAIN" });
    const result = parseContent<LineCountsResult>(response);

    // Should match main.ts despite uppercase search
    expect(result.files.length).toBe(1);
    expect(result.files[0].path).toBe("main.ts");
  });
});

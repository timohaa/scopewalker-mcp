import { mkdir, rm, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from "vitest";
import { analyze } from "../lib/tokei.js";
import type * as tokeiModule from "../lib/tokei.js";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { LineCountsResult } from "../types/index.js";
import { registerLineCountsTool } from "./lineCounts.js";

vi.mock("../lib/tokei.js", async (importOriginal) => {
  const actual = await importOriginal<typeof tokeiModule>();
  return { ...actual, analyze: vi.fn(actual.analyze) };
});

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
  analyzeMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("sorting and totals", () => {
  it("returns flattened file counts sorted by total lines", async () => {
    const response = await handler({ path: testDir });
    expect(response.isError).toBeUndefined();

    const result = parseContent(response) as LineCountsResult;
    expect(result.files.map((f) => f.path)).toEqual(["main.ts", "helper.ts"]);
    expect(result.files[0]?.lines).toEqual({ total: 8, code: 5, comment: 2, blank: 1 });
    expect(result.files[1]?.lines).toEqual({ total: 3, code: 3, comment: 0, blank: 0 });
    expect(result.summary.total_lines).toBe(11);
    expect(result.summary.total_files).toBe(2);
  });

  it("supports alternate sorting", async () => {
    const response = await handler({ path: testDir, sort_by: "name" });
    const result = parseContent(response) as LineCountsResult;
    expect(result.files[0]?.path).toBe("helper.ts");
    expect(result.files[1]?.path).toBe("main.ts");
  });

  it("sorts by lines ascending", async () => {
    const response = await handler({ path: testDir, sort_by: "lines_asc" });
    const result = parseContent(response) as LineCountsResult;

    // helper.ts has 3 lines, main.ts has 8 lines
    expect(result.files[0]?.path).toBe("helper.ts");
    expect(result.files[1]?.path).toBe("main.ts");
  });
});

describe("errors and filtering", () => {
  it("surfaces TOOL_NOT_AVAILABLE when the tokei binary is not on PATH", async () => {
    vi.stubEnv("PATH", "");

    const response = await handler({ path: testDir });
    expect(response.isError).toBe(true);

    const errorPayload = parseContent(response) as { error: { code: string; message: string } };
    expect(errorPayload.error.code).toBe("TOOL_NOT_AVAILABLE");
    expect(errorPayload.error.message).toContain("tokei is not installed");
  });

  it("returns error for nonexistent path", async () => {
    const response = await handler({ path: "/nonexistent/path/12345" });
    expect(response.isError).toBe(true);

    const errorPayload = parseContent(response) as { error: { code: string } };
    expect(errorPayload.error.code).toBe("PATH_NOT_FOUND");
  });

  it("filters files by grep keyword", async () => {
    const response = await handler({ path: testDir, grep: "helper" });
    const result = parseContent(response) as LineCountsResult;

    // Should only include helper.ts (matches "helper")
    expect(result.files.length).toBe(1);
    expect(result.files[0]?.path).toBe("helper.ts");
  });

  it("grep filter is case-insensitive", async () => {
    const response = await handler({ path: testDir, grep: "MAIN" });
    const result = parseContent(response) as LineCountsResult;

    // Should match main.ts despite uppercase search
    expect(result.files.length).toBe(1);
    expect(result.files[0]?.path).toBe("main.ts");
  });

  it("forwards include_hidden to the tokei analyzer", async () => {
    await handler({ path: testDir, include_hidden: true });
    expect(analyzeMock).toHaveBeenCalledWith(
      testDir,
      expect.objectContaining({ includeHidden: true })
    );
  });
});

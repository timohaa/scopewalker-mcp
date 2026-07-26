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

  it("caps scanned files with max_files", async () => {
    const response = await handler({ path: testDir, max_files: 1 });
    const result = parseContent<DocumentationCoverageResult>(response);

    expect(result.by_file).toHaveLength(1);
  });
});

describe("documentationCoverage tool - arrow functions", () => {
  let arrowDir: string;
  const arrowHandler = getToolHandler(
    registerDocumentationCoverageTool,
    "get_documentation_coverage"
  );

  beforeAll(async () => {
    arrowDir = join(tmpdir(), `scopewalker-doc-arrow-test-${String(Date.now())}`);
    await mkdir(arrowDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(arrowDir, { recursive: true, force: true });
  });

  it("does not count inline callback arrows as documentable items", async () => {
    await writeFile(
      join(arrowDir, "callbacks.ts"),
      `/** Doc */
export function getIds(items) {
  return items.map(item => item.id);
}
`
    );

    const response = await arrowHandler({ path: join(arrowDir, "callbacks.ts") });
    const result = parseContent<DocumentationCoverageResult>(response);

    expect(result.coverage.documented).toBe(1);
    expect(result.coverage.undocumented).toBe(0);
    expect(result.coverage.percentage).toBe(100);
  });

  it("counts name-bound arrows under the bound name, including block bodies", async () => {
    await writeFile(
      join(arrowDir, "named.ts"),
      `const identity = (a) => a;

const withBlock = (x) => {
  return x + 1;
};
`
    );

    const response = await arrowHandler({ path: join(arrowDir, "named.ts") });
    const result = parseContent<DocumentationCoverageResult>(response);

    const names = result.undocumented_items.map((i) => i.name);
    expect(names).toContain("identity");
    expect(names).toContain("withBlock");
    // The parameter/body identifier "a" must never be reported as a function name
    expect(names).not.toContain("a");
    expect(names).not.toContain("x");
  });
});

describe("documentationCoverage tool - TS decorators", () => {
  let decoratorDir: string;
  const decoratorHandler = getToolHandler(
    registerDocumentationCoverageTool,
    "get_documentation_coverage"
  );

  beforeAll(async () => {
    decoratorDir = join(tmpdir(), `scopewalker-doc-decorator-test-${String(Date.now())}`);
    await mkdir(decoratorDir, { recursive: true });

    await writeFile(
      join(decoratorDir, "decorated.ts"),
      `/** A documented decorated service. */
@Injectable()
export class DecoratedService {
  /** A documented decorated method. */
  @Log()
  run(): void {}
}
`
    );
  });

  afterAll(async () => {
    await rm(decoratorDir, { recursive: true, force: true });
  });

  it("finds doc comments above decorators for classes and methods", async () => {
    const response = await decoratorHandler({ path: join(decoratorDir, "decorated.ts") });
    const result = parseContent<DocumentationCoverageResult>(response);

    expect(result.coverage.documented).toBe(2);
    expect(result.coverage.undocumented).toBe(0);
  });
});

describe("documentationCoverage tool - non-doc block comments", () => {
  let blockDir: string;
  const blockHandler = getToolHandler(
    registerDocumentationCoverageTool,
    "get_documentation_coverage"
  );

  beforeAll(async () => {
    blockDir = join(tmpdir(), `scopewalker-doc-block-test-${String(Date.now())}`);
    await mkdir(blockDir, { recursive: true });

    await writeFile(
      join(blockDir, "eslint.ts"),
      `/* eslint-disable no-console */
export function log(x: string) {
  console.log(x);
}
`
    );
  });

  afterAll(async () => {
    await rm(blockDir, { recursive: true, force: true });
  });

  it("does not treat plain /* */ block comments as documentation", async () => {
    const response = await blockHandler({ path: join(blockDir, "eslint.ts") });
    const result = parseContent<DocumentationCoverageResult>(response);

    expect(result.coverage.documented).toBe(0);
    expect(result.undocumented_items.map((i) => i.name)).toContain("log");
  });
});

describe("documentationCoverage tool - multi-language", () => {
  let langTestDir: string;
  const langHandler = getToolHandler(
    registerDocumentationCoverageTool,
    "get_documentation_coverage"
  );

  beforeAll(async () => {
    langTestDir = join(tmpdir(), `scopewalker-doc-lang-test-${String(Date.now())}`);
    await mkdir(langTestDir, { recursive: true });

    await writeFile(
      join(langTestDir, "module.py"),
      `def add(a, b):
    """Adds two numbers."""
    return a + b


def subtract(a, b):
    x = a - b
    return x
`
    );

    await writeFile(
      join(langTestDir, "math.go"),
      `package main

// Add adds two numbers.
func Add(a int, b int) int {
	return a + b
}

func Subtract(a int, b int) int {
	return a - b
}
`
    );

    await writeFile(
      join(langTestDir, "calculator.rb"),
      `# Adds two numbers.
def add(a, b)
  a + b
end

def subtract(a, b)
  a - b
end
`
    );
  });

  afterAll(async () => {
    await rm(langTestDir, { recursive: true, force: true });
  });

  it("recognizes Python docstrings, including non-string first statements", async () => {
    const response = await langHandler({ path: join(langTestDir, "module.py") });
    const result = parseContent<DocumentationCoverageResult>(response);

    const names = result.undocumented_items.map((i) => i.name);
    expect(names).toContain("subtract");
    expect(names).not.toContain("add");
  });

  it("recognizes Go line-comment doc conventions", async () => {
    const response = await langHandler({ path: join(langTestDir, "math.go") });
    const result = parseContent<DocumentationCoverageResult>(response);

    const names = result.undocumented_items.map((i) => i.name);
    expect(names).toContain("Subtract");
    expect(names).not.toContain("Add");
  });

  it("recognizes Ruby line-comment doc conventions and top-level defs", async () => {
    const response = await langHandler({ path: join(langTestDir, "calculator.rb") });
    const result = parseContent<DocumentationCoverageResult>(response);

    const names = result.undocumented_items.map((i) => i.name);
    expect(names).toContain("subtract");
    expect(names).not.toContain("add");
  });
});

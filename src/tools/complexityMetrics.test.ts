import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { ComplexityMetricsResult } from "../types/index.js";
import { registerComplexityMetricsTool } from "./complexityMetrics.js";

let testDir: string;
const handler = getToolHandler(registerComplexityMetricsTool, "get_complexity_metrics");

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-cmplx-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });

  await writeFile(
    join(testDir, "nested.ts"),
    `export function deepNesting(x: number): number {
  if (x > 0) {
    for (let i = 0; i < x; i++) {
      if (i % 2 === 0) {
        while (i > 0) {
          if (i === 5) {
            return i;
          }
          i--;
        }
      }
    }
  }
  return 0;
}
`
  );

  await writeFile(
    join(testDir, "manyParams.ts"),
    `export function tooManyParams(
  a: string,
  b: string,
  c: number,
  d: number,
  e: boolean,
  f: boolean,
  g: object,
  h: object
): void {
  console.log(a, b, c, d, e, f, g, h);
}

export function fewParams(x: number, y: number): number {
  return x + y;
}
`
  );

  await writeFile(
    join(testDir, "withImports.ts"),
    `import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export function doSomething(flag: boolean): boolean {
  if (flag && tmpdir()) {
    return true;
  }
  return false;
}
`
  );
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("core metrics", () => {
  it("reports hotspots for nesting and parameter counts", async () => {
    const response = await handler({ path: testDir });
    const result = parseContent<ComplexityMetricsResult>(response);

    const nestingFile = result.files.find((file) => file.path.endsWith("nested.ts"));
    const paramsFile = result.files.find((file) => file.path.endsWith("manyParams.ts"));

    expect(nestingFile?.hotspots.some((hotspot) => hotspot.issue === "nesting_depth")).toBe(true);
    expect(paramsFile?.hotspots.some((hotspot) => hotspot.issue === "parameters")).toBe(true);
  });

  it("summarizes overall complexity metrics", async () => {
    const response = await handler({ path: testDir });
    const result = parseContent<ComplexityMetricsResult>(response);

    expect(result.summary.files_analyzed).toBe(3);
    expect(result.summary.total_hotspots).toBeGreaterThanOrEqual(2);
    expect(result.summary.most_complex_file?.path).toContain("nested.ts");

    const importStats = result.files.find((file) => file.path.endsWith("withImports.ts"));
    expect(importStats?.metrics.dependency_count).toBe(3);
  });
});

describe("output options", () => {
  it("respects limit parameter", async () => {
    // Use extension filter to ensure predictable results (TypeScript files only)
    const response = await handler({ path: testDir, limit: 1, extensions: [".ts"] });
    const result = parseContent<ComplexityMetricsResult>(response);

    expect(result.files).toHaveLength(1);
    // Should return the most complex TypeScript file
    expect(result.files[0]?.path).toContain("nested.ts");
  });

  it("returns summary only when requested", async () => {
    const response = await handler({ path: testDir, summary_only: true });
    const result = parseContent<ComplexityMetricsResult>(response);

    expect(result.summary.files_analyzed).toBeGreaterThan(0);
    expect(result.files).toHaveLength(0);
  });
});

describe("edge cases", () => {
  it("handles arrow functions without parameters", async () => {
    await writeFile(
      join(testDir, "arrows.ts"),
      `export const noParams = () => {
  return 42;
};

export const withParams = (a: number, b: number) => a + b;
`
    );

    const response = await handler({ path: join(testDir, "arrows.ts") });
    const result = parseContent<ComplexityMetricsResult>(response);

    // Should not throw, should analyze both functions
    expect(result.files[0]?.metrics).toBeDefined();
    // Neither should trigger parameter hotspot (0 and 2 params respectively)
    const paramHotspots = result.files[0]?.hotspots.filter((h) => h.issue === "parameters") ?? [];
    expect(paramHotspots).toHaveLength(0);
  });

  it("counts one parameter for unparenthesized single-param arrows", async () => {
    await writeFile(join(testDir, "bareArrow.ts"), `export const dbl = x => x * 2;\n`);

    const response = await handler({ path: join(testDir, "bareArrow.ts") });
    const result = parseContent<ComplexityMetricsResult>(response);

    expect(result.files[0]?.metrics.max_parameters).toBe(1);
  });

  it("reports the same nesting depth for arrows and function declarations", async () => {
    // Identical 4-deep if-nesting; neither variant may exceed the threshold
    const body = `  if (n > 0) {
    if (n > 1) {
      if (n > 2) {
        if (n > 3) {
          return n;
        }
      }
    }
  }
  return 0;`;
    await writeFile(
      join(testDir, "nestingParity.ts"),
      `export function declNested(n: number): number {\n${body}\n}\n\n` +
        `export const arrowNested = (n: number): number => {\n${body}\n};\n`
    );

    const response = await handler({ path: join(testDir, "nestingParity.ts") });
    const result = parseContent<ComplexityMetricsResult>(response);

    // Pre-fix the arrow counted its own node (depth 5) and produced a hotspot
    const nestingHotspots =
      result.files[0]?.hotspots.filter((h) => h.issue === "nesting_depth") ?? [];
    expect(nestingHotspots).toHaveLength(0);
  });

  it("flags arrows and declarations at the same depth once over the threshold", async () => {
    const body = `  if (n > 0) {
    if (n > 1) {
      if (n > 2) {
        if (n > 3) {
          if (n > 4) {
            return n;
          }
        }
      }
    }
  }
  return 0;`;
    await writeFile(
      join(testDir, "nestingParityDeep.ts"),
      `export function declDeep(n: number): number {\n${body}\n}\n\n` +
        `export const arrowDeep = (n: number): number => {\n${body}\n};\n`
    );

    const response = await handler({ path: join(testDir, "nestingParityDeep.ts") });
    const result = parseContent<ComplexityMetricsResult>(response);

    const nestingHotspots =
      result.files[0]?.hotspots.filter((h) => h.issue === "nesting_depth") ?? [];
    expect(nestingHotspots).toHaveLength(2);
    // Both report the true depth of 5; the arrow must not add itself
    expect(nestingHotspots.map((h) => h.value)).toEqual([5, 5]);
  });

  it("handles empty directory", async () => {
    const emptyDir = join(testDir, "empty");
    await mkdir(emptyDir, { recursive: true });

    const response = await handler({ path: emptyDir });
    const result = parseContent<ComplexityMetricsResult>(response);

    expect(result.files).toHaveLength(0);
    expect(result.summary.files_analyzed).toBe(0);
    expect(result.summary.most_complex_file).toBeNull();
  });
});

describe("get_complexity_metrics - request limits and path validation", () => {
  it("analyzes at most max_files files", async () => {
    const response = await handler({ path: testDir, max_files: 1 });
    const result = parseContent<ComplexityMetricsResult>(response);

    expect(result.summary.files_analyzed).toBe(1);
  });

  it("analyzes every file when max_files exceeds the file count", async () => {
    const capped = parseContent<ComplexityMetricsResult>(
      await handler({ path: testDir, max_files: 99 })
    );
    const uncapped = parseContent<ComplexityMetricsResult>(await handler({ path: testDir }));

    expect(capped.summary.files_analyzed).toBe(uncapped.summary.files_analyzed);
    expect(capped.summary.files_analyzed).toBeGreaterThan(1);
  });

  it("returns an error response for a path that does not exist", async () => {
    const response = await handler({ path: join(testDir, "does-not-exist-12345") });

    expect(response.isError).toBe(true);
    const failure = parseContent<{ error: { code: string } }>(response);
    expect(failure.error.code).toBe("PATH_NOT_FOUND");
  });
});

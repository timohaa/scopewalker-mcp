import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { ComplexityMetricsResult, FileComplexity } from "../types/index.js";
import { registerComplexityMetricsTool } from "./complexityMetrics.js";

let testDir: string;
const handler = getToolHandler(registerComplexityMetricsTool, "get_complexity_metrics");

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-cmplx-cyc-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/** Builds a function whose cyclomatic complexity is exactly `decisions + 1`. */
function fnWithDecisions(name: string, decisions: number): string {
  const body = Array.from(
    { length: decisions },
    (_, i) => `  if (x === ${String(i)}) return ${String(i)};`
  ).join("\n");
  return `function ${name}(x: number): number {\n${body}\n  return -1;\n}\n`;
}

/** Writes one file and returns its complexity entry. */
async function analyze(file: string, code: string): Promise<FileComplexity> {
  const path = join(testDir, file);
  await writeFile(path, code);
  const result = parseContent<ComplexityMetricsResult>(await handler({ path }));
  return result.files[0];
}

describe("cyclomatic complexity", () => {
  it("applies no nesting weight", async () => {
    // The structural difference from cognitive complexity, and the thing most
    // likely to regress if someone copies the cognitive walker.
    const nested = await analyze(
      "nested.ts",
      `function f(a: boolean, b: boolean, c: boolean): void {
  if (a) {
    if (b) {
      if (c) {
        deep();
      }
    }
  }
}
`
    );
    const flat = await analyze(
      "flat.ts",
      `function f(a: boolean, b: boolean, c: boolean): void {
  if (a) { one(); }
  if (b) { two(); }
  if (c) { three(); }
}
`
    );

    expect(nested.metrics.max_cyclomatic_complexity).toBe(4);
    expect(flat.metrics.max_cyclomatic_complexity).toBe(4);
    // ...while cognitive complexity still tells them apart.
    expect(nested.metrics.max_cognitive_complexity).toBeGreaterThan(
      flat.metrics.max_cognitive_complexity
    );
  });

  it("counts every function node exactly once", async () => {
    // The TypeScript function-node list contains "function", which also names the
    // unnamed keyword token. Without the isNamed guard this reports 6, not 3.
    const file = await analyze(
      "count.ts",
      `function a(): number { return 1; }
const b = function (): number { return 2; };
const c = (): number => 3;
`
    );

    expect(file.metrics.function_count).toBe(3);
  });

  it("reports no functions and null roll-ups for a file with none", async () => {
    const file = await analyze("types.ts", `export type Alias = string;\nexport const x = 1;\n`);

    expect(file.metrics.function_count).toBe(0);
    expect(file.metrics.max_cyclomatic_complexity).toBe(0);
    expect(file.metrics.avg_cyclomatic_complexity).toBe(0);
    expect(file.metrics.max_cognitive_complexity).toBe(0);
    expect(file.functions).toEqual([]);
  });

  it("keeps the file-sum and per-function-max cognitive scores distinct", async () => {
    const file = await analyze(
      "rollup.ts",
      `${fnWithDecisions("small", 2)}${fnWithDecisions("big", 5)}`
    );

    expect(file.metrics.function_count).toBe(2);
    expect(file.metrics.max_cyclomatic_complexity).toBe(6);
    expect(file.metrics.avg_cyclomatic_complexity).toBe(4.5);
    // The sum covers both functions; the max covers only the worst one.
    expect(file.metrics.cognitive_complexity).toBe(7);
    expect(file.metrics.max_cognitive_complexity).toBe(5);
  });
});

describe("cyclomatic severity bands", () => {
  it("leaves a function at the threshold unreported", async () => {
    const file = await analyze("at-threshold.ts", fnWithDecisions("borderline", 9));

    expect(file.metrics.max_cyclomatic_complexity).toBe(10);
    expect(file.functions).toEqual([]);
  });

  it("flags a function just over the threshold as high", async () => {
    const file = await analyze("high.ts", fnWithDecisions("busy", 10));

    expect(file.metrics.max_cyclomatic_complexity).toBe(11);
    expect(file.functions).toHaveLength(1);
    expect(file.functions[0].name).toBe("busy");
    expect(file.functions[0].cyclomatic_complexity).toBe(11);
    expect(file.functions[0].severity).toBe("high");
  });

  it("keeps a function at the extreme boundary on high", async () => {
    const file = await analyze("at-extreme.ts", fnWithDecisions("heavy", 29));

    expect(file.functions[0].cyclomatic_complexity).toBe(30);
    expect(file.functions[0].severity).toBe("high");
  });

  it("flags a function past the extreme boundary", async () => {
    const file = await analyze("extreme.ts", fnWithDecisions("monster", 30));

    expect(file.functions[0].cyclomatic_complexity).toBe(31);
    expect(file.functions[0].severity).toBe("extreme");
  });
});

describe("reported function selection", () => {
  it("caps the reported functions per file, worst first", async () => {
    // Twelve flagged functions, ascending complexity; only the worst ten survive.
    const code = Array.from({ length: 12 }, (_, i) =>
      fnWithDecisions(`f${String(i)}`, 11 + i)
    ).join("");
    const file = await analyze("many.ts", code);

    expect(file.metrics.function_count).toBe(12);
    expect(file.functions).toHaveLength(10);

    const scores = file.functions.map((f) => f.cyclomatic_complexity);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    // The two least complex were dropped, not the two most complex.
    expect(scores[0]).toBe(23);
    expect(scores.at(-1)).toBe(14);
  });

  it("attributes a nested callback to both itself and its parent", async () => {
    // Policy lock: scores cover the whole subtree, so the parent outranks the
    // callback it contains. Anyone "fixing" the double counting trips this.
    const inner = Array.from(
      { length: 11 },
      (_, i) => `    if (x === ${String(i)}) return ${String(i)};`
    ).join("\n");
    const file = await analyze(
      "nestedfn.ts",
      `function outer(): (x: number) => number {
  const cb = (x: number): number => {
${inner}
    return -1;
  };
  return cb;
}
`
    );

    expect(file.functions).toHaveLength(2);
    const [parent, callback] = file.functions;
    expect(parent.name).toBe("outer");
    expect(callback.name).toBe("<anonymous>");
    expect(parent.cyclomatic_complexity).toBeGreaterThanOrEqual(callback.cyclomatic_complexity);
  });
});

describe("function summary statistics", () => {
  it("counts every analyzed function, ignoring the file limit and the per-file cap", async () => {
    const dir = join(testDir, "summary");
    await mkdir(dir, { recursive: true });
    // Twelve flagged functions in one file, one more in another. The per-file cap
    // is 10 and the limit below returns a single file, but the summary describes
    // everything that was analyzed.
    await writeFile(
      join(dir, "many.ts"),
      Array.from({ length: 12 }, (_, i) => fnWithDecisions(`f${String(i)}`, 11 + i)).join("")
    );
    await writeFile(join(dir, "one.ts"), fnWithDecisions("lonely", 40));

    const result = parseContent<ComplexityMetricsResult>(await handler({ path: dir, limit: 1 }));

    expect(result.files).toHaveLength(1);
    expect(result.summary.high_complexity_functions).toBe(13);
    expect(result.summary.most_complex_function).toEqual({
      path: "one.ts",
      function: "lonely",
      line: 1,
      cyclomatic_complexity: 41,
    });
  });

  it("returns a null most-complex function when no functions exist", async () => {
    const dir = join(testDir, "nofunctions");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "empty.ts"), `export type Alias = string;\n`);

    const result = parseContent<ComplexityMetricsResult>(await handler({ path: dir }));

    expect(result.summary.high_complexity_functions).toBe(0);
    expect(result.summary.most_complex_function).toBeNull();
  });
});

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { firstItem, getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { ComplexityMetricsResult } from "../types/index.js";
import { registerComplexityMetricsTool } from "./complexityMetrics.js";

let testDir: string;
const handler = getToolHandler(registerComplexityMetricsTool, "get_complexity_metrics");

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-cmplx-toplevelfn-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/** Writes one file and returns its analysis. */
async function analyze(
  file: string,
  code: string
): Promise<ComplexityMetricsResult["files"][number]> {
  const path = join(testDir, file);
  await writeFile(path, code);
  const result = parseContent(await handler({ path })) as ComplexityMetricsResult;
  return firstItem(result.files);
}

/** Writes one file and returns its file-level maximum nesting depth. */
async function maxNesting(file: string, code: string): Promise<number> {
  return (await analyze(file, code)).metrics.max_nesting_depth;
}

const FOUR_IFS = `  if (n > 0) {
    if (n > 1) {
      if (n > 2) {
        if (n > 3) {
          return n;
        }
      }
    }
  }
  return 0;`;

const FIVE_IFS = `  if (n > 0) {
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

// The per-function score never counted a function's own node, but the file-level
// score did for an anonymous function defined at the top level: four nested ifs
// reported 4 as a declaration and 5 as an arrow, with no hotspot to explain the 5.
describe("file-level nesting of a function defined at the top level", () => {
  it("reports the same depth for an arrow as for the equivalent declaration", async () => {
    const decl = await analyze(
      "decl.ts",
      `export function declNested(n: number): number {\n${FOUR_IFS}\n}\n`
    );
    const arrow = await analyze(
      "arrow.ts",
      `export const arrowNested = (n: number): number => {\n${FOUR_IFS}\n};\n`
    );

    expect(decl.metrics.max_nesting_depth).toBe(4);
    expect(arrow.metrics.max_nesting_depth).toBe(4);
    // The average runs over AST nodes, and the arrow form has two more wrapper
    // nodes at depth 4 (lexical_declaration, variable_declarator): 36/12 against 28/10.
    expect(decl.metrics.avg_nesting_depth).toBe(2.8);
    expect(arrow.metrics.avg_nesting_depth).toBe(3);
    expect(decl.hotspots.filter((h) => h.issue === "nesting_depth")).toHaveLength(0);
    expect(arrow.hotspots.filter((h) => h.issue === "nesting_depth")).toHaveLength(0);
  });

  it("agrees with the hotspot value once the arrow is over the threshold", async () => {
    const arrow = await analyze(
      "arrowDeep.ts",
      `export const arrowDeep = (n: number): number => {\n${FIVE_IFS}\n};\n`
    );

    expect(arrow.metrics.max_nesting_depth).toBe(5);
    expect(arrow.hotspots.filter((h) => h.issue === "nesting_depth").map((h) => h.value)).toEqual([
      5,
    ]);
  });

  it("does not count the function's own node in other TypeScript definition forms", async () => {
    const body = `{\n    if (n > 0) {\n      return 1;\n    }\n    return 0;\n  }`;

    expect(
      await maxNesting("field.ts", `class A {\n  pick = (n: number): number => ${body};\n}\n`)
    ).toBe(1);
    expect(
      await maxNesting(
        "pair.ts",
        `export const o = {\n  pick: (n: number): number => ${body},\n};\n`
      )
    ).toBe(1);
    expect(await maxNesting("default.ts", `export default (n: number): number => ${body};\n`)).toBe(
      1
    );
    expect(await maxNesting("plain.js", `const pick = (n) => ${body};\n`)).toBe(1);
  });

  it("does not count the function's own node in the other grammars", async () => {
    expect(await maxNesting("lambda.py", `pick = lambda x: x + 1\n`)).toBe(0);
    expect(
      await maxNesting(
        "literal.go",
        `package main\n\nvar pick = func(n int) int {\n\tif n > 0 {\n\t\treturn 1\n\t}\n\treturn 0\n}\n`
      )
    ).toBe(1);
    expect(
      await maxNesting("stabby.rb", `Pick = ->(n) {\n  if n > 0\n    1\n  else\n    0\n  end\n}\n`)
    ).toBe(1);
    expect(
      await maxNesting(
        "Field.java",
        `class Field {\n  Runnable pick = () -> {\n    if (Field.class != null) {\n      return;\n    }\n  };\n}\n`
      )
    ).toBe(1);
    expect(
      await maxNesting(
        "lambda.cpp",
        `auto pick = [](int n) {\n  if (n > 0) {\n    return 1;\n  }\n  return 0;\n};\n`
      )
    ).toBe(1);
    expect(
      await maxNesting(
        "closure.rs",
        `static PICK: fn(i32) -> i32 = |n| {\n    if n > 0 {\n        return 1;\n    }\n    0\n};\n`
      )
    ).toBe(1);
  });
});

describe("file-level nesting of an enclosed anonymous function", () => {
  it("still counts a callback inside a function", async () => {
    const file = await analyze(
      "callback.ts",
      `export function pick(xs: number[]): number[] {\n  return xs.map((x) => {\n    if (x > 0) {\n      return 1;\n    }\n    return 0;\n  });\n}\n`
    );

    expect(file.metrics.max_nesting_depth).toBe(2);
  });

  it("still counts an arrow defined inside a top-level arrow", async () => {
    const depth = await maxNesting(
      "inner.ts",
      `export const outer = (): unknown => {\n  const inner = (x: number): number => {\n    if (x > 0) {\n      return 1;\n    }\n    return 0;\n  };\n  return inner;\n};\n`
    );

    expect(depth).toBe(2);
  });

  it("still counts a callback passed to a call at the top level", async () => {
    const each = await maxNesting(
      "each.ts",
      `declare const xs: number[];\nxs.forEach((x) => {\n  if (x > 0) {\n    console.log(x);\n  }\n});\n`
    );
    const suite = await maxNesting(
      "suite.ts",
      `declare function describe(n: string, f: () => void): void;\ndeclare function it(n: string, f: () => void): void;\ndescribe("a", () => {\n  it("b", () => {\n    if (Date.now() > 0) {\n      console.log(1);\n    }\n  });\n});\n`
    );

    expect(each).toBe(2);
    expect(suite).toBe(3);
  });

  it("still counts a top-level callback in grammars that name the argument list differently", async () => {
    expect(await maxNesting("key.py", `xs = sorted([2, 1], key=lambda x: -x)\n`)).toBe(1);
    expect(await maxNesting("arg.rb", `register(->(x) { x + 1 })\n`)).toBe(1);
    expect(
      await maxNesting(
        "arg.go",
        `package main\n\nvar one = apply(func() int { return 1 })\n\nfunc apply(f func() int) int { return f() }\n`
      )
    ).toBe(1);
    expect(
      await maxNesting(
        "arg.rs",
        `static ONE: i32 = apply(|| 1);\n\nconst fn apply(_f: fn() -> i32) -> i32 {\n    1\n}\n`
      )
    ).toBe(1);
  });

  it("still counts an arrow defined under top-level control flow", async () => {
    const depth = await maxNesting(
      "guarded.ts",
      `export let pick: (n: number) => number;\nif (Date.now() > 0) {\n  pick = (n) => {\n    if (n > 0) {\n      return 1;\n    }\n    return 0;\n  };\n}\n`
    );

    expect(depth).toBe(3);
  });
});

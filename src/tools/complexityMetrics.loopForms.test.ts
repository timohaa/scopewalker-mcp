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
  testDir = join(tmpdir(), `scopewalker-cmplx-loopforms-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/** Writes one file and returns its metrics. */
async function metricsFor(
  file: string,
  code: string
): Promise<ComplexityMetricsResult["files"][number]["metrics"]> {
  const path = join(testDir, file);
  await writeFile(path, code);
  const result = parseContent<ComplexityMetricsResult>(await handler({ path }));
  return result.files[0].metrics;
}

/** Asserts two spellings of the same construct score identically on all three metrics. */
async function expectEquivalent(
  label: string,
  a: { file: string; code: string },
  b: { file: string; code: string }
): Promise<void> {
  const left = await metricsFor(a.file, a.code);
  const right = await metricsFor(b.file, b.code);

  expect(left.cognitive_complexity, `${label} cognitive`).toBe(right.cognitive_complexity);
  expect(left.max_nesting_depth, `${label} nesting`).toBe(right.max_nesting_depth);
  expect(left.max_cyclomatic_complexity, `${label} cyclomatic`).toBe(
    right.max_cyclomatic_complexity
  );
}

// Each of these loop forms scored 0 for both cognitive complexity and nesting
// while the classic form of the same loop scored 1 — they were simply missing
// from the node lists. Java for-each and C++ range-for are the idiomatic forms in
// modern code, so a codebase written that way scored near zero on all its loops.
describe("loop form parity", () => {
  it("scores a Java for-each like a classic for", async () => {
    await expectEquivalent(
      "java for-each",
      {
        file: "Each.java",
        code: `class Each {\n  void f(int[] xs) {\n    for (int x : xs) {\n      g(x);\n    }\n  }\n}\n`,
      },
      {
        file: "Classic.java",
        code: `class Classic {\n  void f(int n) {\n    for (int i = 0; i < n; i++) {\n      g(i);\n    }\n  }\n}\n`,
      }
    );
  });

  it("scores a C++ range-for like a classic for", async () => {
    await expectEquivalent(
      "cpp range-for",
      {
        file: "range.cpp",
        code: `void f(std::vector<int> xs) {\n  for (auto x : xs) {\n    g(x);\n  }\n}\n`,
      },
      {
        file: "classic.cpp",
        code: `void f(int n) {\n  for (int i = 0; i < n; i++) {\n    g(i);\n  }\n}\n`,
      }
    );
  });

  it("scores a do-while like a while", async () => {
    await expectEquivalent(
      "do-while",
      {
        file: "dowhile.ts",
        code: `function f(a: boolean): void {\n  do {\n    x();\n  } while (a);\n}\n`,
      },
      {
        file: "while.ts",
        code: `function f(a: boolean): void {\n  while (a) {\n    x();\n  }\n}\n`,
      }
    );
  });

  it("scores a Ruby case/in like a case/when", async () => {
    await expectEquivalent(
      "ruby case/in",
      {
        file: "casein.rb",
        code: `def f(x)\n  case x\n  in [1, y]\n    y\n  in { k: }\n    k\n  end\nend\n`,
      },
      {
        file: "casewhen.rb",
        code: `def f(x)\n  case x\n  when 1 then 1\n  when 2 then 2\n  end\nend\n`,
      }
    );
  });
});

describe("Ruby statement modifiers", () => {
  it("counts a modifier as a branch but not as a nesting level", async () => {
    // `b if a` is a decision with no block, so it earns a cognitive and cyclomatic
    // increment but must not report a nesting level the way `if a ... end` does.
    const modifier = await metricsFor("modifier.rb", `def f(a)\n  b if a\nend\n`);
    const block = await metricsFor("block.rb", `def f(a)\n  if a\n    b\n  end\nend\n`);

    expect(modifier.cognitive_complexity).toBe(block.cognitive_complexity);
    expect(modifier.max_cyclomatic_complexity).toBe(block.max_cyclomatic_complexity);
    expect(modifier.max_nesting_depth).toBe(0);
    expect(block.max_nesting_depth).toBe(1);
  });
});

describe("Ruby block forms", () => {
  it("counts brace and do-end iterator blocks alike", async () => {
    const doEnd = await metricsFor(
      "doend.rb",
      `def f(xs)\n  xs.each do |a|\n    a.each do |b|\n      b.each do |c|\n        g(c)\n      end\n    end\n  end\nend\n`
    );
    const brace = await metricsFor(
      "brace.rb",
      `def f(xs)\n  xs.each { |a|\n    a.each { |b|\n      b.each { |c| g(c) }\n    }\n  }\nend\n`
    );

    expect(doEnd.max_nesting_depth).toBe(3);
    expect(brace.max_nesting_depth).toBe(3);
  });

  it("does not charge a lambda twice for its own body", async () => {
    // `->(x) { ... }` parses as lambda > block. Counting the body as well as the
    // lambda reported 2 where an arrow function reports 1; the do-end form had
    // that bug before the brace form was ever counted.
    const brace = await metricsFor("lambdabrace.rb", `def o\n  i = ->(x) { x + 1 }\n  i\nend\n`);
    const doEnd = await metricsFor(
      "lambdado.rb",
      `def o\n  i = ->(x) do\n    x + 1\n  end\n  i\nend\n`
    );
    const arrow = await metricsFor(
      "arrow.ts",
      `function o() {\n  const i = (x: number): number => x + 1;\n  return i;\n}\n`
    );

    expect(brace.max_nesting_depth).toBe(1);
    expect(doEnd.max_nesting_depth).toBe(1);
    expect(arrow.max_nesting_depth).toBe(1);
  });

  it("leaves Rust braced scopes uncounted", async () => {
    // tree-sitter-rust names any braced scope `block`, the same name Ruby uses for
    // its brace block. Only Ruby's may count.
    const rust = await metricsFor(
      "scopes.rs",
      `fn f() {\n    let x = { 1 };\n    let y = { 2 };\n}\n`
    );

    expect(rust.max_nesting_depth).toBe(0);
  });
});

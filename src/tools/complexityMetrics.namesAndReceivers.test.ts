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
  testDir = join(tmpdir(), `scopewalker-cx-names-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/** Writes one file and returns its complexity record. */
async function metricsFor(file: string, code: string): Promise<FileComplexity> {
  const path = join(testDir, file);
  await writeFile(path, code);
  const result = parseContent<ComplexityMetricsResult>(await handler({ path }));
  return result.files[0];
}

/** Writes one file and returns the name of its most complex function. */
async function mostComplexName(file: string, code: string): Promise<string | undefined> {
  const path = join(testDir, file);
  await writeFile(path, code);
  const result = parseContent<ComplexityMetricsResult>(await handler({ path }));
  return result.summary.most_complex_function?.function;
}

// This tool kept its own name extractor, which had no C/C++ declarator branch, so
// every C and C++ function was reported as <anonymous> — including the plain ones
// get_functions named correctly.
describe("C and C++ function names", () => {
  it("names a plain C function", async () => {
    expect(await mostComplexName("plain.c", `int f(void) { return 0; }\n`)).toBe("f");
  });

  it("names a pointer-returning C function", async () => {
    expect(await mostComplexName("ptr.c", `char *make_str(void) { return 0; }\n`)).toBe("make_str");
  });

  it("names a C++ member defined out of line", async () => {
    expect(await mostComplexName("member.cpp", `int *W::get() { return 0; }\n`)).toBe("W::get");
  });

  it("names an arrow function bound to a constant", async () => {
    expect(await mostComplexName("arrow.ts", `export const run = () => 1;\n`)).toBe("run");
  });
});

// Go's select is a switch over channels. Cyclomatic already charged per case, but
// the container was in neither the nesting nor the cognitive list, so a select
// block added nothing to either.
describe("Go select", () => {
  it("counts select as one level of nesting and one cognitive point", async () => {
    const withSelect = await metricsFor(
      "sel.go",
      `package main

func f(a chan int, b chan int) {
	select {
	case <-a:
		return
	case <-b:
		return
	}
}
`
    );
    const withSwitch = await metricsFor(
      "sw.go",
      `package main

func f(a int) {
	switch a {
	case 1:
		return
	case 2:
		return
	}
}
`
    );

    expect(withSelect.metrics.max_nesting_depth).toBe(withSwitch.metrics.max_nesting_depth);
    expect(withSelect.metrics.cognitive_complexity).toBe(withSwitch.metrics.cognitive_complexity);
    expect(withSelect.metrics.max_nesting_depth).toBe(1);
  });
});

// The docs say Python skips self/cls and Go excludes the receiver. Rust counted
// its receiver, so the same method reported one parameter more than in Go or Python.
describe("Rust receiver", () => {
  const rust = `pub struct S;
impl S {
    pub fn wide(&self, a: i32, b: i32, c: i32, d: i32, e: i32) -> i32 {
        a + b + c + d + e
    }
}
`;
  const go = `package main

type S struct{}

func (s *S) Wide(a int, b int, c int, d int, e int) int {
	return a + b + c + d + e
}
`;
  const python = `class S:
    def wide(self, a, b, c, d, e):
        return a + b + c + d + e
`;

  it("reports the same parameter count as Go and Python", async () => {
    const [r, g, p] = await Promise.all([
      metricsFor("parity.rs", rust),
      metricsFor("parity.go", go),
      metricsFor("parity.py", python),
    ]);

    expect(r.metrics.max_parameters).toBe(5);
    expect(g.metrics.max_parameters).toBe(5);
    expect(p.metrics.max_parameters).toBe(5);
    expect(r.hotspots.filter((h) => h.issue === "parameters")).toEqual([]);
  });

  it("skips every spelling of the receiver", async () => {
    const file = await metricsFor(
      "receivers.rs",
      `pub struct S;
impl S {
    pub fn a(&mut self, x: i32) -> i32 { x }
    pub fn b(self) {}
    pub fn c(mut self) {}
}
`
    );

    expect(file.metrics.max_parameters).toBe(1);
  });
});

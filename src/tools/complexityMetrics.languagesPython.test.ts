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
  testDir = join(tmpdir(), `scopewalker-cmplx-lang2-py-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("Python", () => {
  it("counts Python imports correctly", async () => {
    await writeFile(
      join(testDir, "sample.py"),
      `import os
from pathlib import Path
import sys

def main():
    pass
`
    );

    const response = await handler({ path: join(testDir, "sample.py") });
    const result = parseContent<ComplexityMetricsResult>(response);

    expect(result.files[0]?.metrics.dependency_count).toBe(3);
  });

  it("scores each elif branch toward cognitive complexity", async () => {
    await writeFile(
      join(testDir, "elif_chain.py"),
      `def classify(x):
    if x == 1:
        return "one"
    elif x == 2:
        return "two"
    elif x == 3:
        return "three"
    return "other"
`
    );

    const response = await handler({ path: join(testDir, "elif_chain.py") });
    const result = parseContent<ComplexityMetricsResult>(response);

    // Python attaches elif_clause to the if_statement instead of nesting a
    // second if, so the chain used to score as a single branch
    expect(result.files[0]?.metrics.cognitive_complexity).toBeGreaterThan(1);
    expect(result.files[0]?.metrics.max_nesting_depth).toBe(1);
  });
});

describe("Python parameter counts", () => {
  it("excludes self/cls from parameter count", async () => {
    await writeFile(
      join(testDir, "class_methods.py"),
      `class MyClass:
    def instance_method(self, a, b, c, d, e, f):
        pass

    @classmethod
    def class_method(cls, x, y):
        pass

def regular_function(a, b, c, d, e, f, g):
    pass
`
    );

    const response = await handler({ path: join(testDir, "class_methods.py") });
    const result = parseContent<ComplexityMetricsResult>(response);

    const hotspots = result.files[0]?.hotspots ?? [];
    const paramHotspots = hotspots.filter((h) => h.issue === "parameters");

    expect(paramHotspots.length).toBeGreaterThanOrEqual(2);
    expect(paramHotspots.some((h) => h.function === "instance_method")).toBe(true);
    expect(paramHotspots.some((h) => h.function === "regular_function")).toBe(true);
    // class_method should NOT appear since it only has 2 params after excluding cls
    expect(paramHotspots.some((h) => h.function === "class_method")).toBe(false);
  });

  it("excludes *args and **kwargs from parameter count", async () => {
    await writeFile(
      join(testDir, "variadic.py"),
      `def variadic_func(a, b, *args, **kwargs):
    pass

def many_params(a, b, c, d, e, f):
    pass
`
    );

    const response = await handler({ path: join(testDir, "variadic.py") });
    const result = parseContent<ComplexityMetricsResult>(response);

    const hotspots = result.files[0]?.hotspots ?? [];
    const paramHotspots = hotspots.filter((h) => h.issue === "parameters");

    // variadic_func has only 2 real params (a, b), *args and **kwargs excluded
    expect(paramHotspots.some((h) => h.function === "variadic_func")).toBe(false);
    // many_params has 6 params, should trigger hotspot
    expect(paramHotspots.some((h) => h.function === "many_params")).toBe(true);
  });

  it("counts parameters following splat markers", async () => {
    await writeFile(
      join(testDir, "keyword_only.py"),
      `def f(*args, self):
    pass

def g(*, self):
    pass
`
    );

    const response = await handler({ path: join(testDir, "keyword_only.py") });
    const result = parseContent<ComplexityMetricsResult>(response);

    // A param named self after a splat/separator is not a receiver and must count
    expect(result.files[0]?.metrics.max_parameters).toBe(1);
  });
});

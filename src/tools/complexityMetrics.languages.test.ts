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
  testDir = join(tmpdir(), `scopewalker-cmplx-lang-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("Go", () => {
  it("counts Go imports correctly", async () => {
    await writeFile(
      join(testDir, "sample.go"),
      `package main

import (
	"fmt"
	"os"
	"path/filepath"
)

func main() {
	fmt.Println("Hello")
}
`
    );

    const response = await handler({ path: join(testDir, "sample.go") });
    const result = parseContent<ComplexityMetricsResult>(response);

    expect(result.files[0]?.metrics.dependency_count).toBe(3);
  });
});

describe("Ruby", () => {
  it("counts Ruby requires correctly", async () => {
    await writeFile(
      join(testDir, "sample.rb"),
      `require 'json'
require_relative 'helper'

def greet(name)
  puts "Hello, #{name}"
end
`
    );

    const response = await handler({ path: join(testDir, "sample.rb") });
    const result = parseContent<ComplexityMetricsResult>(response);

    expect(result.files[0]?.metrics.dependency_count).toBe(2);
  });
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

    // instance_method has 6 params (excluding self), should trigger hotspot (>5)
    // class_method has 2 params (excluding cls), should not trigger
    // regular_function has 7 params, should trigger hotspot
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
});

describe("Java", () => {
  it("does not count else-if chains as nested", async () => {
    await writeFile(
      join(testDir, "ElseIfChain.java"),
      `public class ElseIfChain {
    public void handleEvent(String type) {
        if (type.equals("A")) {
            doA();
        } else if (type.equals("B")) {
            doB();
        } else if (type.equals("C")) {
            doC();
        } else if (type.equals("D")) {
            doD();
        } else if (type.equals("E")) {
            doE();
        } else {
            doDefault();
        }
    }
}
`
    );

    const response = await handler({ path: join(testDir, "ElseIfChain.java") });
    const result = parseContent<ComplexityMetricsResult>(response);

    // The else-if chain should NOT trigger a nesting hotspot
    // Each else-if is a sibling branch, not nested control flow
    // Max nesting should be 1 (just the initial if), not 5+
    expect(result.files[0]?.metrics.max_nesting_depth).toBeLessThanOrEqual(2);

    const nestingHotspots =
      result.files[0]?.hotspots.filter((h) => h.issue === "nesting_depth") ?? [];
    expect(nestingHotspots).toHaveLength(0);
  });

  it("still counts true nesting correctly", async () => {
    await writeFile(
      join(testDir, "TrueNesting.java"),
      `public class TrueNesting {
    public void deepMethod(int x) {
        if (x > 0) {
            for (int i = 0; i < x; i++) {
                if (i % 2 == 0) {
                    while (i > 0) {
                        if (i == 5) {
                            System.out.println("deep");
                        }
                        i--;
                    }
                }
            }
        }
    }
}
`
    );

    const response = await handler({ path: join(testDir, "TrueNesting.java") });
    const result = parseContent<ComplexityMetricsResult>(response);

    // True nesting: if > for > if > while > if = 5 levels
    expect(result.files[0]?.metrics.max_nesting_depth).toBe(5);

    // Should trigger nesting hotspot (threshold is 4)
    const nestingHotspots =
      result.files[0]?.hotspots.filter((h) => h.issue === "nesting_depth") ?? [];
    expect(nestingHotspots.length).toBeGreaterThan(0);
  });
});

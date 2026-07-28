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

describe("parameter counts across grammars", () => {
  it("counts Rust parameters", async () => {
    await writeFile(
      join(testDir, "params.rs"),
      `fn make(a: i32, b: i32, c: i32) -> i32 {
    a + b + c
}
`
    );

    const response = await handler({ path: join(testDir, "params.rs") });
    const result = parseContent<ComplexityMetricsResult>(response);

    expect(result.files[0]?.metrics.max_parameters).toBe(3);
  });

  it("counts Ruby parameters", async () => {
    await writeFile(
      join(testDir, "params.rb"),
      `def baz(a, b, c, d)
end
`
    );

    const response = await handler({ path: join(testDir, "params.rb") });
    const result = parseContent<ComplexityMetricsResult>(response);

    expect(result.files[0]?.metrics.max_parameters).toBe(4);
  });

  it("counts C parameters nested inside the declarator", async () => {
    await writeFile(
      join(testDir, "params.c"),
      `void helper(int a, int b, int c, int d, int e) {}
`
    );

    const response = await handler({ path: join(testDir, "params.c") });
    const result = parseContent<ComplexityMetricsResult>(response);

    expect(result.files[0]?.metrics.max_parameters).toBe(5);
  });

  it("expands Go grouped parameters and ignores the method receiver", async () => {
    await writeFile(
      join(testDir, "params.go"),
      `package main

type Point struct{ X int }

// Grouped "a, b, c int" is a single AST node covering three parameters.
func Make(a, b, c int, d string) int { return a }

func (p *Point) Scale(f int) int { return f }
`
    );

    const response = await handler({ path: join(testDir, "params.go") });
    const result = parseContent<ComplexityMetricsResult>(response);

    expect(result.files[0]?.metrics.max_parameters).toBe(4);
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

  it("scores each elsif branch toward cognitive complexity", async () => {
    await writeFile(
      join(testDir, "elsif_chain.rb"),
      `def classify(x)
  if x == 1
    :one
  elsif x == 2
    :two
  elsif x == 3
    :three
  end
end
`
    );

    const response = await handler({ path: join(testDir, "elsif_chain.rb") });
    const result = parseContent<ComplexityMetricsResult>(response);

    // Ruby's elsif is its own node rather than a nested if, so the chain used to
    // score as a single branch
    expect(result.files[0]?.metrics.cognitive_complexity).toBeGreaterThan(1);
    expect(result.files[0]?.metrics.max_nesting_depth).toBe(1);
  });
});

describe("Rust", () => {
  it("does not count else-if chains as nested", async () => {
    await writeFile(
      join(testDir, "else_if_chain.rs"),
      `fn classify(x: i32) -> i32 {
    if x == 1 {
        1
    } else if x == 2 {
        2
    } else if x == 3 {
        3
    } else {
        0
    }
}
`
    );

    const response = await handler({ path: join(testDir, "else_if_chain.rs") });
    const result = parseContent<ComplexityMetricsResult>(response);

    // Rust names the node if_expression, not if_statement, so the else-if
    // detection used to miss and report the chain as real nesting
    expect(result.files[0]?.metrics.max_nesting_depth).toBe(1);

    const nestingHotspots =
      result.files[0]?.hotspots.filter((h) => h.issue === "nesting_depth") ?? [];
    expect(nestingHotspots).toHaveLength(0);
  });

  it("still counts true nesting correctly", async () => {
    await writeFile(
      join(testDir, "true_nesting.rs"),
      `fn deep(x: i32) {
    if x > 0 {
        for i in 0..x {
            if i % 2 == 0 {
                while i > 0 {
                    if i == 5 {
                        println!("deep");
                    }
                }
            }
        }
    }
}
`
    );

    const response = await handler({ path: join(testDir, "true_nesting.rs") });
    const result = parseContent<ComplexityMetricsResult>(response);

    expect(result.files[0]?.metrics.max_nesting_depth).toBe(5);
  });
});

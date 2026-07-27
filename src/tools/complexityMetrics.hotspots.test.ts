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
  testDir = join(tmpdir(), `scopewalker-cmplx-hotspot-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// Rust models control flow as expressions and Ruby names its nodes after the
// keyword, so both languages once scored zero on every metric but parameters.
describe("hotspots across grammars", () => {
  it("flags a deeply nested Rust function", async () => {
    await writeFile(
      join(testDir, "deep.rs"),
      `fn deep(a: i32, b: i32, c: i32, d: i32, e: i32, f: i32) -> i32 {
    if a > 0 {
        for _ in 0..b {
            while c > 0 {
                match d {
                    _ => { return e + f; }
                }
            }
        }
    }
    0
}
`
    );

    const response = await handler({ path: join(testDir, "deep.rs") });
    const result = parseContent<ComplexityMetricsResult>(response);

    expect(result.files[0]?.metrics.max_nesting_depth).toBe(4);
    expect(result.files[0]?.metrics.cognitive_complexity).toBeGreaterThan(0);

    const hotspots = result.files[0]?.hotspots ?? [];
    expect(hotspots.find((h) => h.issue === "parameters")?.function).toBe("deep");
  });

  it("flags a deeply nested Ruby method", async () => {
    await writeFile(
      join(testDir, "deep.rb"),
      `def deep(a, b, c, d, e, f)
  if a
    while b
      case c
      when 1
        begin
          unless d
            e + f
          end
        rescue
          0
        end
      end
    end
  end
end
`
    );

    const response = await handler({ path: join(testDir, "deep.rb") });
    const result = parseContent<ComplexityMetricsResult>(response);

    // if > while > case > begin > unless
    expect(result.files[0]?.metrics.max_nesting_depth).toBe(5);
    expect(result.files[0]?.metrics.cognitive_complexity).toBeGreaterThan(0);

    const hotspots = result.files[0]?.hotspots ?? [];
    expect(hotspots.find((h) => h.issue === "parameters")?.function).toBe("deep");
    expect(hotspots.some((h) => h.issue === "nesting_depth")).toBe(true);
  });

  // Go names methods with a field_identifier, which the identifier scan rejected.
  it("names a Go method hotspot by its receiver method name", async () => {
    await writeFile(
      join(testDir, "point.go"),
      `package main

type Point struct{ X int }

func (p *Point) Move(a, b, c, d, e, f int) {
	p.X = a + b + c + d + e + f
}
`
    );

    const response = await handler({ path: join(testDir, "point.go") });
    const result = parseContent<ComplexityMetricsResult>(response);

    const paramHotspot = result.files[0]?.hotspots.find((h) => h.issue === "parameters");
    expect(paramHotspot?.function).toBe("Move");
  });
});

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
  testDir = join(tmpdir(), `scopewalker-cmplx-elseifnest-test-${String(Date.now())}`);
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

// Suppressing the else-if takes two separate changes: the branch's own increment,
// and the nesting level handed down to its children. A fix that only does the
// first still scores real nesting inside the branch, so these fixtures are the
// only thing that tells the two halves apart.
describe("else-if nesting suppression", () => {
  it("does not charge nesting to statements inside an else-if branch", async () => {
    // if(a) -> 1. else-if(b) -> flat 1. if(c) nested in the else-if body -> 1 + 1.
    // With only the increment half fixed this scores 5.
    const m = await metricsFor(
      "inner.ts",
      `function f(a: boolean, b: boolean, c: boolean): void {
  if (a) {
    one();
  } else if (b) {
    if (c) {
      two();
    }
  }
}
`
    );

    expect(m.cognitive_complexity).toBe(4);
  });

  it("still charges nesting to a genuinely nested if", async () => {
    // The mirror image: same three ifs, but the second is nested rather than
    // chained, so the suppression must not apply. 1 + 2 + 3.
    const m = await metricsFor(
      "genuine.ts",
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

    expect(m.cognitive_complexity).toBe(6);
  });
});

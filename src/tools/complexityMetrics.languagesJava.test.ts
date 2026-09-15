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
  testDir = join(tmpdir(), `scopewalker-cmplx-lang2-java-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("Java", () => {
  it("counts Java imports correctly", async () => {
    await writeFile(
      join(testDir, "Imports.java"),
      `import java.util.List;
import java.util.Map;
import static java.lang.Math.PI;

public class Imports {
    public void run() {}
}
`
    );

    const response = await handler({ path: join(testDir, "Imports.java") });
    const result = parseContent<ComplexityMetricsResult>(response);

    // import_declaration is shared with Go's grammar, whose handler used to
    // swallow every Java import looking for Go-only import_spec children
    expect(result.files[0]?.metrics.dependency_count).toBe(3);
  });

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

    // Each else-if is a sibling branch, not nested control flow, so depth stays
    // far below the 5 levels a naive walk of this chain would count
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

describe("Java cognitive complexity", () => {
  it("scores a switch toward cognitive complexity", async () => {
    await writeFile(
      join(testDir, "SwitchCase.java"),
      `public class SwitchCase {
    public String classify(int x) {
        switch (x) {
            case 1:
                return "one";
            case 2:
                return "two";
            default:
                return "other";
        }
    }
}
`
    );

    const response = await handler({ path: join(testDir, "SwitchCase.java") });
    const result = parseContent<ComplexityMetricsResult>(response);

    // Java names the node switch_expression, which nesting depth already counted
    // while cognitive complexity used to score it zero
    expect(result.files[0]?.metrics.cognitive_complexity).toBeGreaterThanOrEqual(1);
    expect(result.files[0]?.metrics.max_nesting_depth).toBe(1);
  });
});

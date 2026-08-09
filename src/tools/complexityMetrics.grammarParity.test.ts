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
  testDir = join(tmpdir(), `scopewalker-cmplx-parity-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/** Writes one file per language into a fresh subdirectory and returns its metrics by filename. */
async function measure(
  name: string,
  sources: Record<string, string>
): Promise<Record<string, ComplexityMetricsResult["files"][number]["metrics"]>> {
  const dir = join(testDir, name);
  await mkdir(dir, { recursive: true });
  await Promise.all(
    Object.entries(sources).map(([file, code]) => writeFile(join(dir, file), code))
  );

  const result = parseContent<ComplexityMetricsResult>(await handler({ path: dir }));
  expect(result.files).toHaveLength(Object.keys(sources).length);

  return Object.fromEntries(result.files.map((f) => [f.path, f.metrics]));
}

// Two ternaries, one catch clause, one logical operator, in five languages.
// The ternary alone has three node names (ternary_expression in TS/Java,
// conditional_expression in Python/C++, conditional in Ruby), and Python's
// except_clause and `and` are separate names again.
const MIXED_SOURCES = {
  "s.ts": `function classify(a: number, b: number): number {
  const t = a > 0 ? 1 : 2;
  try {
    run();
  } catch (e) {
    log(e);
  }
  return a > 0 && b > 0 ? t : 0;
}
`,
  "s.py": `def classify(a, b):
    t = 1 if a > 0 else 2
    try:
        run()
    except Exception as e:
        log(e)
    return t if a > 0 and b > 0 else 0
`,
  "s.rb": `def classify(a, b)
  t = a > 0 ? 1 : 2
  begin
    run
  rescue => e
    log(e)
  end
  a > 0 && b > 0 ? t : 0
end
`,
  "S.java": `class S {
  int classify(int a, int b) {
    int t = a > 0 ? 1 : 2;
    try {
      run();
    } catch (Exception e) {
      log(e);
    }
    return a > 0 && b > 0 ? t : 0;
  }
}
`,
  "s.cpp": `int classify(int a, int b) {
  int t = a > 0 ? 1 : 2;
  try {
    run();
  } catch (...) {
    log();
  }
  return a > 0 && b > 0 ? t : 0;
}
`,
};

// Five node names for one construct: arrow_function, lambda (Python and Ruby's
// stabby form), func_literal, lambda_expression. Go's and Python's used to count
// toward neither metric.
const ANON_SOURCES = {
  "a.ts": `function outer() {
  const inner = (x: number) => x + 1;
  return inner;
}
`,
  "a.py": `def outer():
    inner = lambda x: x + 1
    return inner
`,
  "a.rb": `def outer
  inner = ->(x) { x + 1 }
  inner
end
`,
  "a.go": `package main

func outer() func(int) int {
	inner := func(x int) int { return x + 1 }
	return inner
}
`,
  "A.java": `class A {
  Runnable outer() {
    Runnable inner = () -> {};
    return inner;
  }
}
`,
};

// One if plus two else-if branches plus a final else, in seven grammars. Each
// grammar spells the middle branches differently: a nested if_statement after an
// `else` keyword in the C family, elif_clause in Python, elsif in Ruby. Before the
// else-if fix these scored 6/5/6 respectively — the chain was charged as if each
// branch nested inside the previous one.
const ELSE_IF_SOURCES = {
  "e.ts": `function pick(k: number): number {
  if (k === 1) {
    return 1;
  } else if (k === 2) {
    return 2;
  } else if (k === 3) {
    return 3;
  } else {
    return 0;
  }
}
`,
  "e.py": `def pick(k):
    if k == 1:
        return 1
    elif k == 2:
        return 2
    elif k == 3:
        return 3
    else:
        return 0
`,
  "e.rb": `def pick(k)
  if k == 1
    1
  elsif k == 2
    2
  elsif k == 3
    3
  else
    0
  end
end
`,
  "E.java": `class E {
  int pick(int k) {
    if (k == 1) {
      return 1;
    } else if (k == 2) {
      return 2;
    } else if (k == 3) {
      return 3;
    } else {
      return 0;
    }
  }
}
`,
  "e.rs": `fn pick(k: i32) -> i32 {
    if k == 1 {
        1
    } else if k == 2 {
        2
    } else if k == 3 {
        3
    } else {
        0
    }
}
`,
  "e.go": `package main

func pick(k int) int {
	if k == 1 {
		return 1
	} else if k == 2 {
		return 2
	} else if k == 3 {
		return 3
	} else {
		return 0
	}
}
`,
  "e.cpp": `int pick(int k) {
  if (k == 1) {
    return 1;
  } else if (k == 2) {
    return 2;
  } else if (k == 3) {
    return 3;
  } else {
    return 0;
  }
}
`,
};

// These pin symmetry rather than absolute scores: the same logic written in
// different languages must score the same. Every mismatch here has been a real
// bug where one language silently scored zero.
describe("grammar-name parity", () => {
  it("scores ternaries, catch clauses, and logical operators identically across grammars", async () => {
    const metrics = await measure("mixed", MIXED_SOURCES);

    for (const [file, m] of Object.entries(metrics)) {
      expect(m.cognitive_complexity, `${file} cognitive complexity`).toBe(4);
      expect(m.max_nesting_depth, `${file} nesting depth`).toBe(1);
    }
  });

  // Exact values, not lower bounds: the else-if bug survived for so long because
  // every fixture that touched it asserted `toBeGreaterThan(1)`, which 6, 5 and 3
  // all satisfy.
  it("scores an else-if chain as flat sibling branches in every grammar", async () => {
    const metrics = await measure("elseif", ELSE_IF_SOURCES);

    for (const [file, m] of Object.entries(metrics)) {
      expect(m.cognitive_complexity, `${file} cognitive complexity`).toBe(3);
      expect(m.max_nesting_depth, `${file} nesting depth`).toBe(1);
      // Same fixture, opposite rule: an else-if is a real predicate, so McCabe
      // counts it. This is what catches the suppression leaking into cyclomatic.
      expect(m.max_cyclomatic_complexity, `${file} cyclomatic complexity`).toBe(4);
    }
  });

  it("counts an anonymous function as one nesting level in every grammar", async () => {
    const metrics = await measure("anon", ANON_SOURCES);

    for (const [file, m] of Object.entries(metrics)) {
      expect(m.max_nesting_depth, `${file} nesting depth`).toBe(1);
    }
  });
});

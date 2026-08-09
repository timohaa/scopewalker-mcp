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
  testDir = join(tmpdir(), `scopewalker-cmplx-cycparity-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/** Writes one file per language and asserts every one scores the same cyclomatic value. */
async function expectParity(
  name: string,
  sources: Record<string, string>,
  expected: number
): Promise<void> {
  const dir = join(testDir, name);
  await mkdir(dir, { recursive: true });
  await Promise.all(
    Object.entries(sources).map(([file, code]) => writeFile(join(dir, file), code))
  );

  const result = parseContent<ComplexityMetricsResult>(await handler({ path: dir }));
  expect(result.files).toHaveLength(Object.keys(sources).length);

  for (const file of result.files) {
    expect(file.metrics.max_cyclomatic_complexity, `${file.path} cyclomatic`).toBe(expected);
  }
}

// A switch with three real arms plus a default. This is the fixture that pins the
// biggest divergence from cognitive complexity, which charges 1 for the whole
// switch: McCabe charges per arm, so 1 + 3 = 4, and the default adds nothing.
// Every grammar spells both the arm and its default differently.
const SWITCH_SOURCES = {
  "s.ts": `function pick(k: number): number {
  switch (k) {
    case 1: return 1;
    case 2: return 2;
    case 3: return 3;
    default: return 0;
  }
}
`,
  "s.py": `def pick(k):
    match k:
        case 1:
            return 1
        case 2:
            return 2
        case 3:
            return 3
        case _:
            return 0
`,
  "s.rb": `def pick(k)
  case k
  when 1 then 1
  when 2 then 2
  when 3 then 3
  else 0
  end
end
`,
  "s.go": `package main

func pick(k int) int {
	switch k {
	case 1:
		return 1
	case 2:
		return 2
	case 3:
		return 3
	default:
		return 0
	}
}
`,
  "s.rs": `fn pick(k: i32) -> i32 {
    match k {
        1 => 1,
        2 => 2,
        3 => 3,
        _ => 0,
    }
}
`,
  "S.java": `class S {
  int pick(int k) {
    switch (k) {
      case 1: return 1;
      case 2: return 2;
      case 3: return 3;
      default: return 0;
    }
  }
}
`,
  "s.c": `int pick(int k) {
  switch (k) {
    case 1: return 1;
    case 2: return 2;
    case 3: return 3;
    default: return 0;
  }
}
`,
  "s.cpp": `int pick(int k) {
  switch (k) {
    case 1: return 1;
    case 2: return 2;
    case 3: return 3;
    default: return 0;
  }
}
`,
};

// Ruby must use `for..in` here: its idiomatic `.each do` form is a plain method
// call with a block, indistinguishable from map or tap, so it scores 1 while every
// other grammar scores 3. That gap is recorded in known-bugs.md.
const LOOP_SOURCES = {
  "l.ts": `function walk(n: number): void {
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) { visit(i, j); }
  }
}
`,
  "l.py": `def walk(n):
    for i in range(n):
        for j in range(n):
            visit(i, j)
`,
  "l.rb": `def walk(n)
  for i in 0...n
    for j in 0...n
      visit(i, j)
    end
  end
end
`,
  "l.go": `package main

func walk(n int) {
	for i := 0; i < n; i++ {
		for j := 0; j < n; j++ { visit(i, j) }
	}
}
`,
  "l.rs": `fn walk(n: i32) {
    for i in 0..n {
        for j in 0..n {
            visit(i, j);
        }
    }
}
`,
  "L.java": `class L {
  void walk(int n) {
    for (int i = 0; i < n; i++) {
      for (int j = 0; j < n; j++) { visit(i, j); }
    }
  }
}
`,
  "l.c": `void walk(int n) {
  for (int i = 0; i < n; i++) {
    for (int j = 0; j < n; j++) { visit(i, j); }
  }
}
`,
};

// Only six grammars have exception handling; Go, Rust and C are absent by design.
// The handler counts, the finally/ensure does not.
const TRY_SOURCES = {
  "t.ts": `function guard(): void {
  try {
    run();
  } catch (e) {
    log(e);
  } finally {
    done();
  }
}
`,
  "t.py": `def guard():
    try:
        run()
    except Exception as e:
        log(e)
    finally:
        done()
`,
  "t.rb": `def guard
  begin
    run
  rescue => e
    log(e)
  ensure
    done
  end
end
`,
  "T.java": `class T {
  void guard() {
    try {
      run();
    } catch (Exception e) {
      log(e);
    } finally {
      done();
    }
  }
}
`,
  "t.cpp": `void guard() {
  try {
    run();
  } catch (...) {
    log();
  }
}
`,
};

// Nothing here is a branch. Anonymous functions are the trap: five node names
// across the grammars, all of which the cognitive metric treats as nesting.
const ANON_SOURCES = {
  "n.ts": `function outer() {
  const inner = (x: number) => x + 1;
  return inner;
}
`,
  "n.py": `def outer():
    inner = lambda x: x + 1
    return inner
`,
  "n.rb": `def outer
  inner = ->(x) { x + 1 }
  inner
end
`,
  "n.go": `package main

func outer() func(int) int {
	inner := func(x int) int { return x + 1 }
	return inner
}
`,
  "n.rs": `fn outer() {
    let inner = |x: i32| x + 1;
    drop(inner);
}
`,
  "N.java": `class N {
  Runnable outer() {
    Runnable inner = () -> {};
    return inner;
  }
}
`,
  "n.cpp": `void outer() {
  auto inner = [](int x) { return x + 1; };
  (void)inner;
}
`,
};

// The same logic in different languages must score the same. Every mismatch that
// has ever shown up here was one grammar's node name silently scoring zero.
describe("cyclomatic grammar parity", () => {
  it("counts each switch arm and ignores the default in every grammar", async () => {
    await expectParity("switch", SWITCH_SOURCES, 4);
  });

  it("counts nested loops without a nesting weight in every grammar", async () => {
    await expectParity("loops", LOOP_SOURCES, 3);
  });

  it("counts the exception handler but not the finally clause", async () => {
    await expectParity("try", TRY_SOURCES, 2);
  });

  it("treats anonymous functions as non-branches in every grammar", async () => {
    await expectParity("anon", ANON_SOURCES, 1);
  });
});

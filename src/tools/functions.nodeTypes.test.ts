import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { FunctionCountsResult } from "../types/index.js";
import { registerFunctionsTool } from "./functions.js";

let testDir: string;
const handler = getToolHandler(registerFunctionsTool, "get_functions");

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-func-nodetypes-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/** Writes one file and returns the functions found in it. */
async function functionsIn(file: string, code: string): Promise<{ name: string; line: number }[]> {
  const path = join(testDir, file);
  await writeFile(path, code);
  const result = parseContent<FunctionCountsResult>(await handler({ path, detail: "counts" }));
  return result.files[0].functions;
}

// The TypeScript/JavaScript function-node list used to contain `function`, which
// names only the unnamed keyword token, so every declaration matched twice and
// produced a phantom <anonymous> on the same line. Generators were missing from
// the list entirely, and the phantom masked that by standing in for them.
describe("function node type coverage", () => {
  it("finds every function form exactly once", async () => {
    const functions = await functionsIn(
      "forms.ts",
      `function declared(): number { return 1; }
const expression = function (): number { return 2; };
const arrow = (): number => 3;
class K {
  method(): number { return 4; }
}
function* generator(): Generator<number> { yield 5; }
const generatorExpression = function* (): Generator<number> { yield 6; };
`
    );

    expect(functions).toHaveLength(6);
    // Named forms keep their names; only the genuinely anonymous ones are unnamed.
    expect(functions.map((f) => f.name)).toEqual([
      "declared",
      "<anonymous>",
      "<anonymous>",
      "method",
      "generator",
      "<anonymous>",
    ]);
  });

  it("reports a lone declaration once, not twice", async () => {
    // The narrowest regression for the phantom: one function, one entry, and no
    // <anonymous> sharing its line.
    const functions = await functionsIn(
      "single.ts",
      `export function only(a: number) {\n  return a;\n}\n`
    );

    expect(functions).toEqual([{ name: "only", line: 1 }]);
  });

  it("finds a generator declaration by name", async () => {
    // Removing the phantom without adding the generator types would make this
    // file report zero functions.
    const functions = await functionsIn(
      "gen.ts",
      `function* ids(): Generator<number> {\n  yield 1;\n}\n`
    );

    expect(functions).toEqual([{ name: "ids", line: 1 }]);
  });
});

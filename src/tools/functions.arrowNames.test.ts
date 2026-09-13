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
  testDir = join(tmpdir(), `scopewalker-arrow-names-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/** Writes one file and returns the names of the functions found in it. */
async function namesIn(file: string, code: string): Promise<string[]> {
  const path = join(testDir, file);
  await writeFile(path, code);
  const result = parseContent<FunctionCountsResult>(await handler({ path, detail: "counts" }));
  return result.files[0].functions.map((fn) => fn.name);
}

// An arrow bound to a name is the ordinary way to declare a function in modern
// TS/JS. Reporting all of them as <anonymous> left 88% of one real project's
// threshold violations nameless, and get_code_inventory named them all along.
describe("names bound to anonymous function forms", () => {
  it("takes the name from the binding", async () => {
    const names = await namesIn(
      "bound.tsx",
      `const f = () => {};
export const F = () => {};
let g = async () => {};
class K {
  handle = () => {};
}
const obj = { run: () => {} };
exports.foo = () => {};
module.exports.bar = () => {};
const fe = function () {};
`
    );

    expect(names).toEqual(["f", "F", "g", "handle", "run", "foo", "bar", "fe"]);
  });

  it("keeps a function expression's own name over the binding", async () => {
    const names = await namesIn("named.ts", `const outer = function inner() {};\n`);

    expect(names).toEqual(["inner"]);
  });

  it("leaves unbound functions anonymous", async () => {
    const names = await namesIn(
      "unbound.ts",
      `declare const arr: number[];
arr.map((x) => x);
(() => 1)();
const list = [() => 2];
setTimeout(function () {}, 0);
`
    );

    expect(names).toEqual(["<anonymous>", "<anonymous>", "<anonymous>", "<anonymous>"]);
  });

  it("does not borrow a name from an unrelated ancestor", async () => {
    // The arrow sits inside a call inside a declarator; only the immediate
    // parent may supply a name, so `wrapped` must not leak onto the callback.
    const names = await namesIn(
      "ancestor.ts",
      `declare function wrap(fn: () => void): () => void;
const wrapped = wrap(() => {});
`
    );

    expect(names).toEqual(["<anonymous>"]);
  });
});

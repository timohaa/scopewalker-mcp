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
  testDir = join(tmpdir(), `scopewalker-func-names-test-${String(Date.now())}`);
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

// A pointer-returning C function nests its declarator one level deeper than a
// value-returning one, which used to leave 7.7% of a real C project nameless.
describe("C and C++ function names", () => {
  it("names pointer-returning C functions", async () => {
    const names = await namesIn(
      "ptr_ret.c",
      `struct Foo *make_foo(void) {
  return 0;
}

int make_int(void) {
  return 1;
}

char *make_str(void) {
  return 0;
}

static struct Foo *
make_foo_split(void) {
  return 0;
}
`
    );

    expect(names).toEqual(["make_foo", "make_int", "make_str", "make_foo_split"]);
  });

  it("names functions behind several levels of declarator", async () => {
    const names = await namesIn(
      "declarators.c",
      `char **dbl(void) { return 0; }
static void * vp(void) { return 0; }
void (*fptr(int a))(int) { return 0; }
`
    );

    expect(names).toEqual(["dbl", "vp", "fptr"]);
  });

  it("names C++ reference returns, members, and special members", async () => {
    const names = await namesIn(
      "members.cpp",
      `namespace N {
struct W {
  W() {}
  ~W() {}
  int *get() { return 0; }
};
}

int &ref() { static int x; return x; }
N::W &assign(N::W &w) { return w; }
int *N::W::get2() { return 0; }
`
    );

    expect(names).toEqual(["W", "~W", "get", "ref", "assign", "N::W::get2"]);
  });
});

// `.h` serves both languages. Mapping it to C reported the `class` keyword as a
// function and dropped every member of a C++ header.
describe("C++ header detection", () => {
  it("parses a .h containing a class as C++", async () => {
    const names = await namesIn("cls.h", `class B { public: void run() {} };\n`);

    expect(names).toEqual(["run"]);
  });

  it("still parses a plain C header as C", async () => {
    const names = await namesIn(
      "plain.h",
      `struct Foo { int a; };
static struct Foo *make(void) { return 0; }
`
    );

    expect(names).toEqual(["make"]);
  });
});

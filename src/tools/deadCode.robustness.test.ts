import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { DeadCodeItem, DeadCodeResult } from "../types/index.js";
import { registerDeadCodeTool } from "./deadCode.js";

const handler = getToolHandler(registerDeadCodeTool, "find_dead_code");

/** Runs the tool over a single file and returns both lists concatenated. */
async function findingsOf(path: string): Promise<DeadCodeItem[]> {
  const response = await handler({ path, limit: 100 });
  const result = parseContent<DeadCodeResult>(response);
  return [...result.dead_code, ...result.unreferenced_exports];
}

/** Fixtures for guards around dynamic-reference and declaration-only cases. */
async function writeScriptGuardFixtures(dir: string): Promise<void> {
  await writeFile(
    join(dir, "template.ts"),
    `function target() {
  return 1;
}

const label = \`use \${target()} here\`;
`
  );

  await writeFile(
    join(dir, "widget.tsx"),
    `function Widget() {
  return null;
}

const el = <Widget />;
`
  );

  await writeFile(
    join(dir, "valid.rb"),
    `class Widget
  private

  def valid?
    true
  end
end

subject = Widget.new
subject.valid?
`
  );

  await writeFile(join(dir, "declareConst.ts"), `declare const declaredUnused: number;\n`);

  await writeFile(join(dir, "scriptGlobal.js"), `function globalFn() {\n  return 1;\n}\n`);
}

/** Fixtures for guards around class-member visibility and framework hooks. */
async function writeClassGuardFixtures(dir: string): Promise<void> {
  await writeFile(
    join(dir, "hooks.ts"),
    `import { Transform } from "node:stream";
export class Detector extends Transform {
  _flush(callback: () => void): void {
    callback();
  }
  private helper(): number {
    return 1;
  }
}
`
  );

  await writeFile(
    join(dir, "decorated.ts"),
    `class Foo {
  @deco
  private hidden() {
    return 1;
  }
}
`
  );
}

/** Fixtures for guards specific to C, C++, Go, and Rust. */
async function writeSystemsGuardFixtures(dir: string): Promise<void> {
  await writeFile(
    join(dir, "tokenPasting.c"),
    `#define CONCAT(a, b) a##b

int unusedFn(void) {
    return 1;
}
`
  );

  await writeFile(
    join(dir, "goExport.go"),
    `package sample

//export ffiTarget
func ffiTarget() {}
`
  );

  await writeFile(
    join(dir, "rustAttrs.rs"),
    `#[no_mangle]
fn ffi_fn() {}

#[derive(Debug)]
struct Data {
    x: i32,
}
`
  );

  await writeFile(
    join(dir, "outOfLine.cpp"),
    `class Widget {
private:
  void resize() {}
};

void Widget::resize() {}
`
  );
}

let dir: string;

beforeAll(async () => {
  dir = join(tmpdir(), `scopewalker-dead-robust-${String(Date.now())}`);
  await mkdir(dir, { recursive: true });

  await writeScriptGuardFixtures(dir);
  await writeClassGuardFixtures(dir);
  await writeSystemsGuardFixtures(dir);
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/**
 * Each fixture here isolates one false-alarm guard from the rest, since a real
 * false alarm must never appear even when the surrounding code looks ordinary.
 */
describe("find_dead_code - false-alarm guards", () => {
  it("counts a name interpolated into a template literal as a reference", async () => {
    const findings = await findingsOf(join(dir, "template.ts"));
    expect(findings.some((item) => item.name === "target")).toBe(false);
  });

  it("counts a component used as a JSX tag as a reference", async () => {
    const findings = await findingsOf(join(dir, "widget.tsx"));
    expect(findings.some((item) => item.name === "Widget")).toBe(false);
  });

  it("matches a Ruby `valid?` declaration to a `.valid?` call", async () => {
    const findings = await findingsOf(join(dir, "valid.rb"));
    expect(findings.some((item) => item.name === "valid?")).toBe(false);
  });

  it("excludes a `declare const` from candidates entirely", async () => {
    const response = await handler({ path: join(dir, "declareConst.ts"), limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    expect(result.summary.symbols_checked).toBe(0);
  });

  it("treats an unused top-level function in a script file as unreferenced_exports", async () => {
    const response = await handler({ path: join(dir, "scriptGlobal.js"), limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    expect(result.dead_code.some((item) => item.name === "globalFn")).toBe(false);
    expect(result.unreferenced_exports.some((item) => item.name === "globalFn")).toBe(true);
  });

  it("excludes a decorated TS method regardless of use", async () => {
    const findings = await findingsOf(join(dir, "decorated.ts"));
    expect(findings.some((item) => item.name === "hidden")).toBe(false);
  });

  it("excludes an underscore method of a subclass but keeps its explicit private one", async () => {
    // Node calls _flush by name from inside Transform, which is outside the scan.
    const findings = await findingsOf(join(dir, "hooks.ts"));
    expect(findings.some((item) => item.name === "_flush")).toBe(false);
    expect(findings.some((item) => item.name === "helper")).toBe(true);
  });

  it("yields no candidates from a C file using token pasting", async () => {
    const response = await handler({ path: join(dir, "tokenPasting.c"), limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    expect(result.summary.symbols_checked).toBe(0);
  });

  it("keeps a Go symbol alive when a //export directive names it", async () => {
    const findings = await findingsOf(join(dir, "goExport.go"));
    expect(findings.some((item) => item.name === "ffiTarget")).toBe(false);
  });

  it("excludes #[no_mangle] while still treating a #[derive(Debug)] struct as a candidate", async () => {
    const response = await handler({ path: join(dir, "rustAttrs.rs"), limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    const findings = [...result.dead_code, ...result.unreferenced_exports];
    expect(findings.some((item) => item.name === "ffi_fn")).toBe(false);
    expect(findings.some((item) => item.name === "Data")).toBe(true);
  });

  it("keeps a private C++ method alive when an out-of-line definition references it", async () => {
    const findings = await findingsOf(join(dir, "outOfLine.cpp"));
    expect(findings.some((item) => item.name === "resize")).toBe(false);
  });
});

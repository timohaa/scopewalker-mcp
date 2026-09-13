import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { DeadCodeItem, DeadCodeResult } from "../types/index.js";
import { registerDeadCodeTool } from "./deadCode.js";

const handler = getToolHandler(registerDeadCodeTool, "find_dead_code");

/** Runs the tool over a directory and returns both lists concatenated. */
async function findingsOf(path: string): Promise<DeadCodeItem[]> {
  const response = await handler({ path, limit: 100 });
  const result = parseContent<DeadCodeResult>(response);
  return [...result.dead_code, ...result.unreferenced_exports];
}

let dir: string;

beforeAll(async () => {
  dir = join(tmpdir(), `scopewalker-dead-rs-${String(Date.now())}`);
  await mkdir(join(dir, "basic"), { recursive: true });
  await mkdir(join(dir, "traits"), { recursive: true });
  await mkdir(join(dir, "inherent"), { recursive: true });

  await writeFile(
    join(dir, "basic", "lib.rs"),
    `fn private_unused() {}

pub(crate) fn crate_unused() {}

#[test]
fn test_case() {}

#[derive(Debug)]
struct DataUnused {
    x: i32,
}
`
  );

  await writeFile(
    join(dir, "basic", "commented.rs"),
    `#[test]
// A comment between the attribute and its item must not hide the attribute.
#[allow(clippy::unwrap_used)]
fn commented_test() {}
`
  );

  await writeFile(
    join(dir, "traits", "traits.rs"),
    `trait Greet {
    fn hello() {}
}

struct Speaker;

impl Greet for Speaker {
    fn hello() {}
}
`
  );

  await writeFile(
    join(dir, "inherent", "widget.rs"),
    `struct Widget;

impl Widget {
    fn inherent_unused() {}
}
`
  );
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("find_dead_code - Rust", () => {
  it("marks a private Rust item as dead_code when scanning its directory", async () => {
    const findings = await findingsOf(join(dir, "basic"));
    expect(findings).toContainEqual(
      expect.objectContaining({ name: "private_unused", type: "function" })
    );
  });

  it("marks a pub(crate) Rust item as unreferenced_exports", async () => {
    const response = await handler({ path: join(dir, "basic"), limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    expect(result.unreferenced_exports.some((item) => item.name === "crate_unused")).toBe(true);
    expect(result.dead_code.some((item) => item.name === "crate_unused")).toBe(false);
  });

  it("excludes a #[test] function", async () => {
    const findings = await findingsOf(join(dir, "basic"));
    expect(findings.some((item) => item.name === "test_case")).toBe(false);
  });

  it("excludes a #[test] function even with a comment between attribute and item", async () => {
    const findings = await findingsOf(join(dir, "basic"));
    expect(findings.some((item) => item.name === "commented_test")).toBe(false);
  });

  it("still treats a #[derive(Debug)] struct as a candidate", async () => {
    const findings = await findingsOf(join(dir, "basic"));
    expect(findings.some((item) => item.name === "DataUnused")).toBe(true);
  });

  it("never treats a trait method or its trait impl as a candidate", async () => {
    const response = await handler({ path: join(dir, "traits"), limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    const findings = [...result.dead_code, ...result.unreferenced_exports];

    expect(findings.some((item) => item.name === "hello")).toBe(false);
    // The trait declaration and the struct are candidates (both `hello`
    // definitions are excluded); both stay live because `impl Greet for
    // Speaker` mentions each of their names again.
    expect(result.summary.symbols_checked).toBe(2);
  });

  it("still treats an inherent impl method as a candidate", async () => {
    const findings = await findingsOf(join(dir, "inherent"));
    expect(findings).toContainEqual(
      expect.objectContaining({ name: "inherent_unused", type: "function" })
    );
  });
});

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { DeadCodeItem, DeadCodeResult } from "../types/index.js";
import { registerDeadCodeTool } from "./deadCode.js";

const handler = getToolHandler(registerDeadCodeTool, "find_dead_code");

/** Runs the tool and returns both lists concatenated, the shape most assertions need. */
async function findingsOf(
  path: string,
  extra: Record<string, unknown> = {}
): Promise<DeadCodeItem[]> {
  const response = await handler({ path, limit: 100, ...extra });
  const result = parseContent<DeadCodeResult>(response);
  return [...result.dead_code, ...result.unreferenced_exports];
}

describe("find_dead_code - Python", () => {
  let dir: string;

  beforeAll(async () => {
    dir = join(tmpdir(), `scopewalker-dead-py-${String(Date.now())}`);
    await mkdir(dir, { recursive: true });

    await writeFile(
      dir + "/mod.py",
      `def _private_unused():
    return 1


def public_unused():
    return 2


def test_something():
    pass


class TestWidget:
    pass


class Widget:
    def __init__(self):
        pass
`
    );
    await writeFile(
      dir + "/decorated.py",
      `@some_decorator
def decorated_unused():
    pass
`
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("marks an underscore-prefixed module-level function as dead_code on a directory scan", async () => {
    const response = await handler({ path: dir, limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    expect(result.dead_code.some((item) => item.name === "_private_unused")).toBe(true);
  });

  it("marks a public module-level function as unreferenced_exports", async () => {
    const response = await handler({ path: dir, limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    expect(result.unreferenced_exports.some((item) => item.name === "public_unused")).toBe(true);
  });

  it("excludes test_-prefixed functions and Test-prefixed classes", async () => {
    const findings = await findingsOf(dir);
    expect(findings.some((item) => item.name === "test_something")).toBe(false);
    expect(findings.some((item) => item.name === "TestWidget")).toBe(false);
  });

  it("excludes dunder methods like __init__", async () => {
    const findings = await findingsOf(dir);
    expect(findings.some((item) => item.name === "__init__")).toBe(false);
  });

  it("excludes a decorated top-level function", async () => {
    const findings = await findingsOf(dir);
    expect(findings.some((item) => item.name === "decorated_unused")).toBe(false);
  });
});

describe("find_dead_code - Go", () => {
  let dir: string;

  beforeAll(async () => {
    dir = join(tmpdir(), `scopewalker-dead-go-${String(Date.now())}`);
    await mkdir(dir, { recursive: true });

    await writeFile(
      dir + "/main.go",
      `package sample

func main() {}

func init() {}

func TestSomething() {}

func unexportedUnused() {}

type Widget struct{}

func (w *Widget) hidden() {}

func sharedHelper() int {
	return 1
}
`
    );
    await writeFile(
      dir + "/other.go",
      `package sample

func caller() int {
	return sharedHelper()
}
`
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("excludes main, init, and Test-prefixed functions", async () => {
    const findings = await findingsOf(dir);
    expect(findings.some((item) => ["main", "init", "TestSomething"].includes(item.name))).toBe(
      false
    );
  });

  it("marks an unexported unused function as dead_code on a directory scan", async () => {
    const response = await handler({ path: dir, limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    expect(result.dead_code.some((item) => item.name === "unexportedUnused")).toBe(true);
  });

  it("marks the same unexported function as unreferenced_exports on a single-file scan", async () => {
    const response = await handler({ path: join(dir, "main.go"), limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    expect(result.dead_code.some((item) => item.name === "unexportedUnused")).toBe(false);
    expect(result.unreferenced_exports.some((item) => item.name === "unexportedUnused")).toBe(true);
  });

  it("collects an unexported receiver method as a dead method candidate", async () => {
    const response = await handler({ path: dir, limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    expect(result.dead_code).toContainEqual(
      expect.objectContaining({ name: "hidden", type: "method" })
    );
  });

  it("keeps an unexported function alive when another file in the package calls it", async () => {
    const findings = await findingsOf(dir);
    expect(findings.some((item) => item.name === "sharedHelper")).toBe(false);
  });

  it("moves a package-scoped finding to unreferenced_exports when max_depth is set on a directory scan", async () => {
    const response = await handler({ path: dir, limit: 100, max_depth: 5 });
    const result = parseContent<DeadCodeResult>(response);

    expect(result.summary.scan_complete).toBe(true);
    expect(result.dead_code.some((item) => item.name === "unexportedUnused")).toBe(false);
    expect(result.unreferenced_exports.some((item) => item.name === "unexportedUnused")).toBe(true);
  });
});

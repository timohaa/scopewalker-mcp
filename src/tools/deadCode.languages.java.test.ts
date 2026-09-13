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

describe("find_dead_code - Java", () => {
  let dir: string;

  beforeAll(async () => {
    dir = join(tmpdir(), `scopewalker-dead-java-${String(Date.now())}`);
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, "Acct.java"),
      `class PackagePrivateClass {}

public class Holder {
  private void secretUnused() {}

  @Test
  void annotatedUnused() {}

  Object readResolve() {
    return this;
  }
}
`
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("marks a private method as dead_code only on a directory scan", async () => {
    const dirResponse = await handler({ path: dir, limit: 100 });
    const dirResult = parseContent<DeadCodeResult>(dirResponse);
    expect(dirResult.dead_code).toContainEqual(
      expect.objectContaining({ name: "secretUnused", type: "method" })
    );

    const fileResponse = await handler({ path: join(dir, "Acct.java"), limit: 100 });
    const fileResult = parseContent<DeadCodeResult>(fileResponse);
    expect(fileResult.dead_code.some((item) => item.name === "secretUnused")).toBe(false);
    expect(fileResult.unreferenced_exports.some((item) => item.name === "secretUnused")).toBe(true);
  });

  it("marks a package-private top-level class as dead_code when scanning its directory", async () => {
    const response = await handler({ path: dir, limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    expect(result.dead_code.some((item) => item.name === "PackagePrivateClass")).toBe(true);
  });

  it("excludes an annotated method regardless of use", async () => {
    const findings = await findingsOf(dir);
    expect(findings.some((item) => item.name === "annotatedUnused")).toBe(false);
  });

  it("excludes readResolve as a serialization hook", async () => {
    const findings = await findingsOf(dir);
    expect(findings.some((item) => item.name === "readResolve")).toBe(false);
  });
});

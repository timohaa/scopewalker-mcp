import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { DeadCodeResult } from "../types/index.js";
import { registerDeadCodeTool } from "./deadCode.js";

const handler = getToolHandler(registerDeadCodeTool, "find_dead_code");

describe("find_dead_code - scan-size guards", () => {
  let dir: string;

  beforeAll(async () => {
    dir = join(tmpdir(), `scopewalker-dead-limits-${String(Date.now())}`);
    await mkdir(join(dir, "dts"), { recursive: true });

    await writeFile(
      join(dir, "dts", "normal.ts"),
      `import { strict as assert } from "node:assert";

function normalUnused() {
  return 1;
}
`
    );
    await writeFile(join(dir, "dts", "types.d.ts"), `declare function ambientThing(): void;\n`);

    await writeFile(
      join(dir, "deepNesting.ts"),
      `function target() {
  return 1;
}

const nested = ${"(".repeat(600)}target()${")".repeat(600)};
`
    );

    // 1.1 MB of comment text pushes the file past the 1 MB read guard, so it is
    // counted as analyzable but never parsed.
    await writeFile(
      join(dir, "oversized.ts"),
      `/*\n${"x".repeat(1_150_000)}\n*/\nfunction bigFileFn() {\n  return 1;\n}\nbigFileFn();\n`
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("scans a .d.ts file for references without taking candidates from it", async () => {
    const response = await handler({ path: join(dir, "dts"), limit: 100 });
    const result = parseContent<DeadCodeResult>(response);

    expect(result.summary.files_scanned).toBe(2);
    expect(result.summary.files_skipped).toBe(0);
    expect(result.summary.scan_complete).toBe(true);
    expect(result.dead_code.some((item) => item.name === "normalUnused")).toBe(true);
    const findings = [...result.dead_code, ...result.unreferenced_exports];
    expect(findings.some((item) => item.name === "ambientThing")).toBe(false);
  });

  it("still counts a reference nested more than 500 AST levels deep", async () => {
    const response = await handler({ path: join(dir, "deepNesting.ts"), limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    const findings = [...result.dead_code, ...result.unreferenced_exports];
    expect(findings.some((item) => item.name === "target")).toBe(false);
  });

  it("marks the scan incomplete when a file exceeds the 1 MB size guard", async () => {
    const response = await handler({ path: join(dir, "oversized.ts"), limit: 100 });
    const result = parseContent<DeadCodeResult>(response);

    expect(result.summary.scan_complete).toBe(false);
    expect(result.summary.files_scanned).toBe(0);
  });
});

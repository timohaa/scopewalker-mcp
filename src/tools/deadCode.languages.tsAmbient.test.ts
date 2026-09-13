import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { DeadCodeItem, DeadCodeResult } from "../types/index.js";
import { registerDeadCodeTool } from "./deadCode.js";

const handler = getToolHandler(registerDeadCodeTool, "find_dead_code");

let dir: string;

async function scan(path: string): Promise<DeadCodeResult> {
  const response = await handler({ path, limit: 100 });
  return parseContent<DeadCodeResult>(response);
}

async function findingsOf(path: string): Promise<DeadCodeItem[]> {
  const result = await scan(path);
  return [...result.dead_code, ...result.unreferenced_exports];
}

beforeAll(async () => {
  dir = join(tmpdir(), `scopewalker-dead-ts-ambient-${String(Date.now())}`);
  await mkdir(join(dir, "abstract"), { recursive: true });
  await mkdir(join(dir, "dts"), { recursive: true });

  await writeFile(
    join(dir, "abstract", "shape.ts"),
    `export abstract class Shape {
  abstract area(): number;
}

export class Circle extends Shape {
  area(): number {
    return 1;
  }
}
`
  );

  await writeFile(
    join(dir, "abstract", "orphan.ts"),
    `export const marker = 1;

abstract class OrphanBase {
  run(): void {}
}
`
  );

  await writeFile(
    join(dir, "dts", "a.ts"),
    `export function usedInDts() {}
export function usedInTs() {}
export function neverUsed() {}
`
  );

  await writeFile(
    join(dir, "dts", "b.ts"),
    `import { usedInTs } from "./a";

usedInTs();
`
  );

  await writeFile(
    join(dir, "dts", "types.d.ts"),
    `import { usedInDts } from "./a";

export declare const x: typeof usedInDts;
`
  );
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("find_dead_code - TypeScript abstract classes", () => {
  it("does not report an abstract class that a subclass extends", async () => {
    const findings = await findingsOf(join(dir, "abstract", "shape.ts"));
    expect(findings.some((item) => item.name === "Shape")).toBe(false);
  });

  it("reports an unreferenced module-private abstract class as dead_code", async () => {
    const result = await scan(join(dir, "abstract", "orphan.ts"));
    expect(result.dead_code).toContainEqual(
      expect.objectContaining({ name: "OrphanBase", type: "class" })
    );
  });
});

describe("find_dead_code - references from .d.ts files", () => {
  it("counts a reference that only a .d.ts file makes", async () => {
    const findings = await findingsOf(join(dir, "dts"));
    expect(findings.some((item) => item.name === "usedInDts")).toBe(false);
    expect(findings.some((item) => item.name === "usedInTs")).toBe(false);
  });

  it("still reports a symbol no file references", async () => {
    const result = await scan(join(dir, "dts"));
    expect(result.unreferenced_exports).toContainEqual(
      expect.objectContaining({ name: "neverUsed", type: "function" })
    );
  });

  it("takes no candidate from a .d.ts file while counting it as scanned", async () => {
    const result = await scan(join(dir, "dts"));
    const findings = [...result.dead_code, ...result.unreferenced_exports];

    expect(findings.some((item) => item.name === "x")).toBe(false);
    expect(result.summary.files_scanned).toBe(3);
    expect(result.summary.files_skipped).toBe(0);
    expect(result.summary.scan_complete).toBe(true);
  });
});

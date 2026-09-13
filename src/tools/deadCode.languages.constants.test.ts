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
  dir = join(tmpdir(), `scopewalker-dead-constants-${String(Date.now())}`);
  await mkdir(join(dir, "rust"), { recursive: true });
  await mkdir(join(dir, "go"), { recursive: true });

  await writeFile(
    join(dir, "rust", "config.rs"),
    `const DEAD_CONST: i32 = 1;
static DEAD_STATIC: &str = "x";
pub const PUB_DEAD_CONST: i32 = 2;
const USED_CONST: i32 = 3;
const MACRO_ONLY: &str = "m";

#[cfg(feature = "extra")]
const CFG_ONLY: i32 = 4;

pub fn keep() -> i32 {
    println!("{}", MACRO_ONLY);
    USED_CONST
}

#[cfg(feature = "extra")]
pub fn keep_cfg() -> i32 {
    CFG_ONLY
}
`
  );

  await writeFile(
    join(dir, "go", "config.go"),
    `package config

const DeadExported = 1

const (
	deadGrouped = 2
	usedGrouped = 3
)

func Use() int {
	return usedGrouped
}
`
  );
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("find_dead_code - Rust constants", () => {
  it("reports an unreferenced private const and static as dead_code", async () => {
    const result = await scan(join(dir, "rust"));

    expect(result.dead_code).toContainEqual(
      expect.objectContaining({ name: "DEAD_CONST", type: "constant" })
    );
    expect(result.dead_code).toContainEqual(
      expect.objectContaining({ name: "DEAD_STATIC", type: "constant" })
    );
  });

  it("reports an unreferenced pub const as unreferenced_exports", async () => {
    const result = await scan(join(dir, "rust"));
    expect(result.unreferenced_exports).toContainEqual(
      expect.objectContaining({ name: "PUB_DEAD_CONST", type: "constant" })
    );
  });

  it("does not report a const used in code, a macro, or a cfg-gated item", async () => {
    const findings = await findingsOf(join(dir, "rust"));

    expect(findings.some((item) => item.name === "USED_CONST")).toBe(false);
    expect(findings.some((item) => item.name === "MACRO_ONLY")).toBe(false);
    expect(findings.some((item) => item.name === "CFG_ONLY")).toBe(false);
  });
});

describe("find_dead_code - Go constants", () => {
  it("reports an unreferenced unexported const as dead_code", async () => {
    const result = await scan(join(dir, "go"));
    expect(result.dead_code).toContainEqual(
      expect.objectContaining({ name: "deadGrouped", type: "constant" })
    );
  });

  it("reports an unreferenced exported const as unreferenced_exports", async () => {
    const result = await scan(join(dir, "go"));
    expect(result.unreferenced_exports).toContainEqual(
      expect.objectContaining({ name: "DeadExported", type: "constant" })
    );
  });

  it("does not report a const the package uses", async () => {
    const findings = await findingsOf(join(dir, "go"));
    expect(findings.some((item) => item.name === "usedGrouped")).toBe(false);
  });
});

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { CodeInventoryResult } from "../types/index.js";
import { registerCodeInventoryTool } from "./codeInventory.js";

/**
 * Rust functions inside a trait or a trait impl carry no `pub` of their own, so
 * the visibility filter must not read the missing keyword as private.
 */

let testDir: string;
const handler = getToolHandler(registerCodeInventoryTool, "get_code_inventory");

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-inv-rust-traits-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });
  await writeFile(
    join(testDir, "widget.rs"),
    `use std::fmt;

pub struct Widget {
    w: i32,
}

impl fmt::Display for Widget {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{}", self.w)
    }
}

pub trait Shape {
    fn area(&self) -> f64;
    fn describe(&self) -> String {
        format!("{}", self.area())
    }
}

impl Widget {
    pub fn new() -> Self {
        Widget { w: 1 }
    }

    fn helper(&self) {}
}
`
  );
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/** Items the default inventory reports for the fixture. */
async function defaultItems(): Promise<CodeInventoryResult["inventory"][number]["items"]> {
  const response = await handler({ path: join(testDir, "widget.rs") });
  const result = parseContent<CodeInventoryResult>(response);
  return result.inventory[0]?.items ?? [];
}

/** Names of the items the default inventory reports for the fixture. */
async function defaultNames(): Promise<string[]> {
  return (await defaultItems()).map((item) => item.name);
}

describe("codeInventory - Rust trait members", () => {
  it("keeps a trait impl method in the default view", async () => {
    expect(await defaultNames()).toContain("fmt");
  });

  it("lists a trait's members under the trait, not as standalone functions", async () => {
    const items = await defaultItems();
    const shape = items.find((item) => item.name === "Shape");

    expect(shape?.methods?.map((m) => m.name)).toEqual(["area", "describe"]);
    expect(items.some((item) => item.name === "describe")).toBe(false);
  });

  it("counts interface methods without counting the trait as a class", async () => {
    const response = await handler({ path: join(testDir, "widget.rs") });
    const result = parseContent<CodeInventoryResult>(response);

    expect(result.summary.total_methods).toBe(2);
    expect(result.summary.total_classes).toBe(1);
  });

  it("still filters a non-pub inherent method by default", async () => {
    const names = await defaultNames();
    expect(names).toContain("new");
    expect(names).not.toContain("helper");
  });
});

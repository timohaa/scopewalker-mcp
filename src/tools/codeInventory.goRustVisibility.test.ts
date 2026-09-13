import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { CodeInventoryResult } from "../types/index.js";
import { registerCodeInventoryTool } from "./codeInventory.js";

// Go and Rust mark visibility in the language itself rather than with an export
// keyword, so reading only export statements reported every symbol as internal.
let visTestDir: string;
const visHandler = getToolHandler(registerCodeInventoryTool, "get_code_inventory");

beforeAll(async () => {
  visTestDir = join(tmpdir(), `scopewalker-inv-vis-test-${String(Date.now())}`);
  await mkdir(visTestDir, { recursive: true });

  await writeFile(
    join(visTestDir, "shapes.go"),
    `package main

type Point struct{ X int }

func Exported() {}

func unexported() {}

func (p *Point) Visible() {}

func (p *Point) hidden() {}
`
  );

  await writeFile(
    join(visTestDir, "widget.rs"),
    `pub struct Widget { w: u32 }

pub fn public_fn() {}

fn private_fn() {}

pub(crate) fn crate_fn() {}

pub fn _hidden() {}

mod internal {
  pub(super) fn super_fn() {}
  pub(self) fn self_fn() {}
  pub(in crate::internal) fn scoped_fn() {}
}
`
  );
});

afterAll(async () => {
  await rm(visTestDir, { recursive: true, force: true });
});

describe("codeInventory tool - Go and Rust visibility", () => {
  it("reads Go export status from identifier capitalization", async () => {
    const response = await visHandler({ path: join(visTestDir, "shapes.go") });
    const result = parseContent<CodeInventoryResult>(response);

    const byName = new Map((result.inventory[0]?.items ?? []).map((i) => [i.name, i]));

    expect(byName.get("Point")?.exported).toBe(true);
    expect(byName.get("Exported")?.exported).toBe(true);
    expect(result.summary.exported_symbols).toBe(2);
  });

  it("treats lowercase Go symbols as private", async () => {
    const excluded = await visHandler({ path: join(visTestDir, "shapes.go") });
    const withoutPrivate = parseContent<CodeInventoryResult>(excluded);
    expect(withoutPrivate.inventory[0]?.items.some((i) => i.name === "unexported")).toBe(false);

    const included = await visHandler({
      path: join(visTestDir, "shapes.go"),
      include_private: true,
    });
    const withPrivate = parseContent<CodeInventoryResult>(included);
    const unexported = withPrivate.inventory[0]?.items.find((i) => i.name === "unexported");

    expect(unexported?.exported).toBe(false);
  });

  it("labels Go method visibility by receiver-method capitalization", async () => {
    const response = await visHandler({
      path: join(visTestDir, "shapes.go"),
      include_private: true,
    });
    const result = parseContent<CodeInventoryResult>(response);

    const point = result.inventory[0]?.items.find((i) => i.name === "Point");
    const byName = new Map((point?.methods ?? []).map((m) => [m.name, m.visibility]));

    expect(byName.get("Visible")).toBe("public");
    expect(byName.get("hidden")).toBe("private");
  });

  it.each([undefined, false, true])(
    "filters Rust visibility with include_private=%s and preserves export status",
    async (includePrivate) => {
      const response = await visHandler({
        path: join(visTestDir, "widget.rs"),
        include_private: includePrivate,
      });
      const result = parseContent<CodeInventoryResult>(response);

      const exports = Object.fromEntries(
        (result.inventory[0]?.items ?? []).map((item) => [item.name, item.exported])
      );
      expect(exports).toEqual({
        Widget: true,
        public_fn: true,
        ...(includePrivate === true
          ? {
              private_fn: false,
              crate_fn: false,
              _hidden: true,
              super_fn: false,
              self_fn: false,
              scoped_fn: false,
            }
          : {}),
      });
      expect(result.summary.total_functions).toBe(includePrivate === true ? 7 : 1);
      expect(result.summary.exported_symbols).toBe(includePrivate === true ? 3 : 2);
    }
  );
});

import { mkdir, rm, writeFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { CodeInventoryResult, DeadCodeResult } from "../types/index.js";
import { registerCodeInventoryTool } from "./codeInventory.js";
import { registerDeadCodeTool } from "./deadCode.js";

let testDir: string;
const handler = getToolHandler(registerCodeInventoryTool, "get_code_inventory");
const deadCodeHandler = getToolHandler(registerDeadCodeTool, "find_dead_code");

beforeAll(async () => {
  const tempPath = join(
    process.cwd(),
    "node_modules/.cache",
    `scopewalker-inv-ruby-modules-${String(Date.now())}`
  );
  await mkdir(tempPath, { recursive: true });
  testDir = await realpath(tempPath);
  await writeFile(join(testDir, "direct.rb"), "module Helpers; def helper; end; end\n");
  await writeFile(
    join(testDir, "scopes.rb"),
    `module Helpers
  def helper; end
  def self.utility; end
  def _hidden; end
  def self._hidden_utility; end
  if enabled
    def conditional; end
  else
    def fallback; end
  end
  begin
    def wrapped; end
  end
  class Widget
    def member; end
    def self.factory; end
    if enabled
      def conditional_member; end
    end
    class << self
      def singleton_member; end
      if enabled
        def conditional_singleton; end
      end
    end
  end
  class << self
    def module_singleton_member; end
  end
end
`
  );
  await writeFile(
    join(testDir, "nested.rb"),
    `def outer
  def inner; end
end

class K
  def m
    def deep; end
  end
end

Widget = Struct.new(:a) do
  def blocky; end
end

module Concern
  included do
    def from_block; end
  end
  def self.mod_singleton; end
end

RSpec.describe "x" do
  def spec_helper; end
end
`
  );
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/** Reads the module fixture with the requested private-symbol visibility. */
async function inventoryOf(file: string, includePrivate = false): Promise<CodeInventoryResult> {
  const response = await handler({ path: join(testDir, file), include_private: includePrivate });
  expect(response.isError).toBeUndefined();
  return parseContent<CodeInventoryResult>(response);
}

describe("codeInventory - Ruby modules", () => {
  it("omits defs nested in methods and do blocks while listing a direct module singleton", async () => {
    const result = await inventoryOf("nested.rb", true);
    const items = result.inventory[0]?.items ?? [];
    expect(items.map(({ name, type }) => ({ name, type }))).toEqual([
      { name: "outer", type: "function" },
      { name: "K", type: "class" },
      { name: "mod_singleton", type: "function" },
    ]);
    expect(items.find((item) => item.name === "K")?.methods?.map((method) => method.name)).toEqual([
      "m",
    ]);
  });

  it("adds only the direct module singleton to unreferenced exports", async () => {
    const response = await deadCodeHandler({ path: join(testDir, "nested.rb") });
    expect(response.isError).toBeUndefined();
    const result = parseContent<DeadCodeResult>(response);
    expect(result.summary.scan_complete).toBe(true);
    expect(result.dead_code).toEqual([]);
    expect(result.unreferenced_exports.map((item) => item.name).sort()).toEqual([
      "K",
      "mod_singleton",
      "outer",
    ]);
  });

  it("lists a method directly inside a module as a top-level function", async () => {
    const result = await inventoryOf("direct.rb");
    expect(result.inventory[0]?.items).toEqual([
      { name: "helper", type: "function", line: 1, exported: false },
    ]);
    expect(result.summary.total_files).toBe(1);
    expect(result.summary.total_functions).toBe(1);
    expect(result.summary.total_classes).toBe(0);
    expect(result.summary.total_methods).toBe(0);
  });

  it("lists module defs while keeping class and singleton-class members out of functions", async () => {
    const result = await inventoryOf("scopes.rb", true);
    const items = result.inventory[0]?.items ?? [];
    expect(items.filter((item) => item.type === "function").map((item) => item.name)).toEqual([
      "helper",
      "utility",
      "_hidden",
      "_hidden_utility",
      "conditional",
      "fallback",
      "wrapped",
    ]);
    expect(
      items.find((item) => item.name === "Widget")?.methods?.map((method) => method.name)
    ).toEqual(["member", "factory", "conditional_member"]);
    expect(result.summary.total_classes).toBe(1);
    expect(result.summary.total_methods).toBe(3);
    expect(items).toHaveLength(8);
  });

  it("filters underscore-prefixed module functions unless include_private is set", async () => {
    const result = await inventoryOf("scopes.rb");
    const items = result.inventory[0]?.items ?? [];
    expect(items.filter((item) => item.type === "function").map((item) => item.name)).toEqual([
      "helper",
      "utility",
      "conditional",
      "fallback",
      "wrapped",
    ]);

    const withPrivate = await inventoryOf("scopes.rb", true);
    expect(withPrivate.inventory[0]?.items.map((item) => item.name)).toEqual(
      expect.arrayContaining(["_hidden", "_hidden_utility"])
    );
  });
});

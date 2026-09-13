import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { CodeInventoryResult, InventoryItem } from "../types/index.js";
import { registerCodeInventoryTool } from "./codeInventory.js";

/**
 * Ruby names operators, setters and compactly scoped classes with node types of
 * its own, and allows a `def` inside a conditional in a class body.
 */

let testDir: string;
const handler = getToolHandler(registerCodeInventoryTool, "get_code_inventory");

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-inv-ruby-names-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });

  await writeFile(
    join(testDir, "vector.rb"),
    `class Vector
  def initialize(x)
    @x = x
  end

  def ==(other)
    @x == other.x
  end

  def <=>(other)
    @x <=> other.x
  end

  def +(other)
    Vector.new(@x + other.x)
  end

  def [](i)
    @x[i]
  end

  def []=(i, v)
    @x[i] = v
  end

  def to_s
    @x.to_s
  end
end
`
  );

  await writeFile(
    join(testDir, "widget.rb"),
    `class Widget
  def self.value
    @value
  end

  def self.value=(v)
    @value = v
  end

  def name=(n)
    @name = n
  end

  def -@
    self
  end
end
`
  );

  await writeFile(
    join(testDir, "compact.rb"),
    `class A::B::E
  def m3
    3
  end
end
`
  );

  await writeFile(
    join(testDir, "conditional.rb"),
    `class Proxy
  def always
    1
  end

  if RUBY_VERSION > "3"
    def maybe
      2
    end
  else
    def maybe
      3
    end
  end
end
`
  );
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/** Runs the tool over one fixture file and returns its result. */
async function inventoryOf(file: string): Promise<CodeInventoryResult> {
  const response = await handler({ path: join(testDir, file), include_private: true });
  return parseContent<CodeInventoryResult>(response);
}

/** Finds one item of a single-file inventory by name. */
function itemNamed(result: CodeInventoryResult, name: string): InventoryItem | undefined {
  return result.inventory[0]?.items.find((item) => item.name === name);
}

describe("codeInventory - Ruby method names", () => {
  it("keeps the name of an operator method", async () => {
    const result = await inventoryOf("vector.rb");
    const methods = itemNamed(result, "Vector")?.methods ?? [];

    expect(methods.map((m) => m.name)).toEqual([
      "initialize",
      "==",
      "<=>",
      "+",
      "[]",
      "[]=",
      "to_s",
    ]);
    expect(result.summary.total_methods).toBe(7);
    expect(result.summary.total_classes).toBe(1);
    expect(result.summary.total_functions).toBe(0);
  });

  it("keeps the name of a setter and a unary operator", async () => {
    const result = await inventoryOf("widget.rb");
    const methods = itemNamed(result, "Widget")?.methods ?? [];

    expect(methods.map((m) => m.name)).toEqual(["value", "value=", "name=", "-@"]);
  });
});

describe("codeInventory - Ruby class scoping", () => {
  it("inventories a compactly scoped class under its written name", async () => {
    const result = await inventoryOf("compact.rb");
    const item = itemNamed(result, "A::B::E");

    expect(item?.type).toBe("class");
    expect(item?.methods?.map((m) => m.name)).toEqual(["m3"]);
    expect(result.summary.total_classes).toBe(1);
    expect(result.summary.total_functions).toBe(0);
  });

  it("attaches a def nested in a conditional to the enclosing class", async () => {
    const result = await inventoryOf("conditional.rb");
    const methods = itemNamed(result, "Proxy")?.methods ?? [];

    expect(methods.map((m) => m.name)).toEqual(["always", "maybe", "maybe"]);
    // A conditional def must not also stand alone as a top-level function
    expect(result.summary.total_functions).toBe(0);
    expect(result.summary.total_methods).toBe(3);
  });
});

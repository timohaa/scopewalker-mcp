import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { CodeInventoryResult, InventoryItem } from "../types/index.js";
import { registerCodeInventoryTool } from "./codeInventory.js";

/**
 * A Java constructor and a record body are declared under node types distinct
 * from the ordinary method and class forms.
 */

let testDir: string;
const handler = getToolHandler(registerCodeInventoryTool, "get_code_inventory");

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-inv-java-types-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });

  await writeFile(
    join(testDir, "Kitchen.java"),
    `package demo;

public class Kitchen {
    public Kitchen() {}
    Kitchen(int x) {}

    public void cook() {}
    private void secretSauce() {}
}
`
  );

  await writeFile(
    join(testDir, "Point.java"),
    `package demo;

public record Point(int x, int y) {
    public int sum() {
        return x + y;
    }
}

public interface Greeter {
    void greet();
}

public enum Color { RED, GREEN }
`
  );
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

/** Runs the tool over one fixture file and returns its result. */
async function inventoryOf(file: string, includePrivate = false): Promise<CodeInventoryResult> {
  const response = await handler({
    path: join(testDir, file),
    include_private: includePrivate,
  });
  return parseContent<CodeInventoryResult>(response);
}

/** Finds one item of a single-file inventory by name. */
function itemNamed(result: CodeInventoryResult, name: string): InventoryItem | undefined {
  return result.inventory[0]?.items.find((item) => item.name === name);
}

describe("codeInventory - Java constructors", () => {
  it("lists a public constructor among the class methods", async () => {
    const result = await inventoryOf("Kitchen.java");
    const methods = itemNamed(result, "Kitchen")?.methods ?? [];

    expect(methods.map((m) => m.name)).toEqual(["Kitchen", "cook"]);
    expect(result.summary.total_methods).toBe(2);
  });

  it("treats a package-private constructor as private, like any other member", async () => {
    const result = await inventoryOf("Kitchen.java", true);
    const methods = itemNamed(result, "Kitchen")?.methods ?? [];
    const constructors = methods.filter((m) => m.name === "Kitchen");

    expect(constructors.map((m) => m.visibility)).toEqual(["public", "private"]);
  });
});

describe("codeInventory - Java records and other type declarations", () => {
  it("inventories a record as a class with its methods", async () => {
    const result = await inventoryOf("Point.java");
    const point = itemNamed(result, "Point");

    expect(point?.type).toBe("class");
    expect(point?.exported).toBe(true);
    expect(point?.methods?.map((m) => m.name)).toEqual(["sum"]);
  });

  it("inventories interfaces and enums alongside the record", async () => {
    const result = await inventoryOf("Point.java");

    expect(itemNamed(result, "Greeter")?.type).toBe("interface");
    expect(itemNamed(result, "Color")?.type).toBe("enum");
    expect(result.summary.total_classes).toBe(1);
    expect(result.summary.total_methods).toBe(1);
    expect(result.summary.exported_symbols).toBe(3);
  });
});

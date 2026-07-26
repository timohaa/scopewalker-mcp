import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { CodeInventoryResult } from "../types/index.js";
import { registerCodeInventoryTool } from "./codeInventory.js";

// These grammars name records and enums with node types distinct from the
// class_declaration family, so only their functions used to be inventoried.
describe("codeInventory tool - C++ record types", () => {
  let cppTestDir: string;
  const cppHandler = getToolHandler(registerCodeInventoryTool, "get_code_inventory");

  beforeAll(async () => {
    cppTestDir = join(tmpdir(), `scopewalker-inv-cpp-test-${String(Date.now())}`);
    await mkdir(cppTestDir, { recursive: true });

    await writeFile(
      join(cppTestDir, "widget.cpp"),
      `class Widget {
public:
  void render(int a) {}
  int declOnly(int a);
  int field;
};
struct Point { int x; };
enum Color { RED };
void helper(int a) {}
Point makePoint(int x) { return Point(); }
`
    );
  });

  afterAll(async () => {
    await rm(cppTestDir, { recursive: true, force: true });
  });

  it("indexes C++ classes, structs, and enums alongside functions", async () => {
    const response = await cppHandler({ path: join(cppTestDir, "widget.cpp") });
    const result = parseContent<CodeInventoryResult>(response);

    const items = result.inventory[0]?.items ?? [];
    const byName = new Map(items.map((i) => [i.name, i]));

    expect(byName.get("Widget")?.type).toBe("class");
    expect(byName.get("Point")?.type).toBe("class");
    expect(byName.get("Color")?.type).toBe("enum");
    expect(byName.get("helper")?.type).toBe("function");
    expect(byName.get("Widget::resize")).toBeUndefined();
  });

  it("collects C++ class members, including body-less declarations", async () => {
    const response = await cppHandler({ path: join(cppTestDir, "widget.cpp") });
    const result = parseContent<CodeInventoryResult>(response);

    const widget = result.inventory[0]?.items.find((i) => i.name === "Widget");
    const methods = widget?.methods?.map((m) => m.name) ?? [];

    expect(methods).toContain("render");
    expect(methods).toContain("declOnly");
    // Data members are not methods, and members must not double as top-level items
    expect(methods).not.toContain("field");
    expect(result.inventory[0]?.items.some((i) => i.name === "render")).toBe(false);
  });

  it("names a C++ function by its declarator, not its return type", async () => {
    const response = await cppHandler({ path: join(cppTestDir, "widget.cpp") });
    const result = parseContent<CodeInventoryResult>(response);

    // `Point makePoint(int)` puts a type_identifier ahead of the declarator, so
    // an identifier-first scan would report the return type as the name
    const fns = (result.inventory[0]?.items ?? []).filter((i) => i.type === "function");
    expect(fns.map((i) => i.name)).toEqual(["helper", "makePoint"]);
  });
});

describe("codeInventory tool - Rust and Go record types", () => {
  let typeTestDir: string;
  const typeHandler = getToolHandler(registerCodeInventoryTool, "get_code_inventory");

  beforeAll(async () => {
    typeTestDir = join(tmpdir(), `scopewalker-inv-types-test-${String(Date.now())}`);
    await mkdir(typeTestDir, { recursive: true });

    await writeFile(
      join(typeTestDir, "shapes.rs"),
      `struct Point { x: i32 }
enum Color { Red }
trait Shape {}
fn make(a: i32) -> i32 { a }
`
    );

    await writeFile(
      join(typeTestDir, "shapes.go"),
      `package main

type Point struct{ X int }

type Shape interface{ Area() int }

func (p *Point) Scale(f int) int { return f }

func (p Point) Norm() int { return 0 }

func (o *Other) Detached() int { return 0 }

func Make(a int) int { return a }
`
    );
  });

  afterAll(async () => {
    await rm(typeTestDir, { recursive: true, force: true });
  });

  it("indexes Rust structs, enums, and traits", async () => {
    const response = await typeHandler({ path: join(typeTestDir, "shapes.rs") });
    const result = parseContent<CodeInventoryResult>(response);

    const byName = new Map((result.inventory[0]?.items ?? []).map((i) => [i.name, i]));

    expect(byName.get("Point")?.type).toBe("class");
    expect(byName.get("Color")?.type).toBe("enum");
    expect(byName.get("Shape")?.type).toBe("interface");
    expect(byName.get("make")?.type).toBe("function");
  });

  it("indexes Go struct and interface type declarations", async () => {
    const response = await typeHandler({ path: join(typeTestDir, "shapes.go") });
    const result = parseContent<CodeInventoryResult>(response);

    const byName = new Map((result.inventory[0]?.items ?? []).map((i) => [i.name, i]));

    expect(byName.get("Point")?.type).toBe("class");
    expect(byName.get("Shape")?.type).toBe("interface");
    expect(byName.get("Make")?.type).toBe("function");
  });

  // Go declares methods outside the type body, so they need pairing by receiver.
  it("attaches Go methods to their receiver type", async () => {
    const response = await typeHandler({ path: join(typeTestDir, "shapes.go") });
    const result = parseContent<CodeInventoryResult>(response);

    const items = result.inventory[0]?.items ?? [];
    const point = items.find((i) => i.name === "Point");

    // Both pointer and value receivers resolve to the same type
    expect(point?.methods?.map((m) => m.name)).toEqual(["Scale", "Norm"]);
    // Methods must not also surface as standalone top-level items
    expect(items.some((i) => i.name === "Scale")).toBe(false);
    // A receiver with no local type declaration has nothing to attach to
    expect(items.some((i) => i.name === "Detached")).toBe(false);
  });
});

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { CodeSmellsResult } from "../types/index.js";
import { registerCodeSmellsTool } from "./codeSmells.js";

describe("get_code_smells - unsafe_cast detection", () => {
  const handler = getToolHandler(registerCodeSmellsTool, "get_code_smells");
  let testDir: string;

  beforeAll(async () => {
    testDir = join(tmpdir(), `scopewalker-smells-unsafe-test-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("detects 'as unknown as' pattern", async () => {
    await writeFile(
      join(testDir, "unsafe_casts.ts"),
      `interface Foo { x: number }
interface Bar { y: string }

function convert(foo: Foo): Bar {
  return foo as unknown as Bar;
}

const value = someObj as unknown as SomeType;
`
    );

    const response = await handler({
      path: join(testDir, "unsafe_casts.ts"),
      types: ["unsafe_cast"],
    });
    const result = parseContent<CodeSmellsResult>(response);

    expect(result.summary.by_type.unsafe_cast).toBe(2);
    expect(result.files.length).toBe(1);
  });

  it("detects 'as any as' pattern", async () => {
    await writeFile(
      join(testDir, "any_casts.ts"),
      `function unsafeCast(x: string): number {
  return x as any as number;
}
`
    );

    const response = await handler({
      path: join(testDir, "any_casts.ts"),
      types: ["unsafe_cast"],
    });
    const result = parseContent<CodeSmellsResult>(response);

    expect(result.summary.by_type.unsafe_cast).toBe(1);
  });

  it("does not detect simple as expressions", async () => {
    await writeFile(
      join(testDir, "safe_casts.ts"),
      `interface Animal { name: string }
interface Dog extends Animal { breed: string }

const dog: Dog = { name: "Rex", breed: "German Shepherd" };
const animal = dog as Animal; // This is a safe upcast
const str = "hello" as string; // Simple assertion
`
    );

    const response = await handler({
      path: join(testDir, "safe_casts.ts"),
      types: ["unsafe_cast"],
    });
    const result = parseContent<CodeSmellsResult>(response);

    expect(result.summary.by_type.unsafe_cast).toBe(0);
  });

  it("includes text when requested", async () => {
    await writeFile(
      join(testDir, "cast_with_text.ts"),
      `const x = foo as unknown as Bar;
`
    );

    const response = await handler({
      path: join(testDir, "cast_with_text.ts"),
      types: ["unsafe_cast"],
      include_text: true,
    });
    const result = parseContent<CodeSmellsResult>(response);

    expect(result.files[0]?.smells[0]?.text).toContain("as unknown as");
  });

  it("redacts text by default", async () => {
    await writeFile(
      join(testDir, "cast_redacted.ts"),
      `const x = foo as unknown as Bar;
`
    );

    const response = await handler({
      path: join(testDir, "cast_redacted.ts"),
      types: ["unsafe_cast"],
    });
    const result = parseContent<CodeSmellsResult>(response);

    expect(result.files[0]?.smells[0]?.text).toBe("<redacted>");
  });
});

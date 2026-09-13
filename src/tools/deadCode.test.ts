import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { DeadCodeItem, DeadCodeResult } from "../types/index.js";
import { registerDeadCodeTool } from "./deadCode.js";

const handler = getToolHandler(registerDeadCodeTool, "find_dead_code");

/** Runs the tool and returns both lists concatenated, the shape most assertions need. */
async function findingsOf(
  path: string,
  extra: Record<string, unknown> = {}
): Promise<DeadCodeItem[]> {
  const response = await handler({ path, limit: 100, ...extra });
  const result = parseContent<DeadCodeResult>(response);
  return [...result.dead_code, ...result.unreferenced_exports];
}

let rootDir: string;

beforeAll(async () => {
  rootDir = join(tmpdir(), `scopewalker-dead-core-${String(Date.now())}`);

  await mkdir(join(rootDir, "basic"), { recursive: true });
  await writeFile(
    join(rootDir, "basic", "core.ts"),
    `import { strict as assert } from "node:assert";

function localUnused() {
  return 1;
}

export function exportedUnused() {
  return 2;
}

function usedFn() {
  return 3;
}
usedFn();

const constFn = () => {
  return 4;
};

interface UnusedInterface {
  x: number;
}

type UnusedType = string;

class UsedViaNew {}
const instance = new UsedViaNew();

class UsedAsType {}
function accept(w: UsedAsType) {}

class WithMethods {
  private unusedPrivate() {
    return 5;
  }

  publicMethod() {
    return 6;
  }
}
`
  );

  await mkdir(join(rootDir, "crossfile"), { recursive: true });
  await writeFile(
    join(rootDir, "crossfile", "crossA.ts"),
    `function crossUsed() {\n  return 1;\n}\n`
  );
  await writeFile(join(rootDir, "crossfile", "crossB.ts"), `crossUsed();\n`);

  await mkdir(join(rootDir, "reexport"), { recursive: true });
  await writeFile(
    join(rootDir, "reexport", "lib.ts"),
    `export function reExported() {\n  return 1;\n}\n`
  );
  await writeFile(join(rootDir, "reexport", "index.ts"), `export { reExported } from "./lib";\n`);

  await mkdir(join(rootDir, "shadow"), { recursive: true });
  await writeFile(join(rootDir, "shadow", "shadowA.ts"), `function shared() {\n  return 1;\n}\n`);
  await writeFile(join(rootDir, "shadow", "shadowB.ts"), `function shared() {\n  return 2;\n}\n`);
  await writeFile(join(rootDir, "shadow", "shadowC.ts"), `shared();\n`);

  await mkdir(join(rootDir, "methodscope"), { recursive: true });
  await writeFile(
    join(rootDir, "methodscope", "acct.ts"),
    `class Acct {
  private secret() {
    return 1;
  }
}
`
  );
});

afterAll(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

describe("find_dead_code - TS/JS core detection", () => {
  const basicDir = (): string => join(rootDir, "basic");

  it("marks a non-exported unused top-level function as dead_code", async () => {
    const findings = await findingsOf(basicDir());
    expect(findings).toContainEqual(
      expect.objectContaining({ name: "localUnused", type: "function" })
    );
  });

  it("marks an exported unused function as unreferenced_exports rather than dead_code", async () => {
    const response = await handler({ path: basicDir(), limit: 100 });
    const result = parseContent<DeadCodeResult>(response);

    expect(result.dead_code.some((item) => item.name === "exportedUnused")).toBe(false);
    expect(result.unreferenced_exports.some((item) => item.name === "exportedUnused")).toBe(true);
  });

  it("omits a function that is called within the same file", async () => {
    const findings = await findingsOf(basicDir());
    expect(findings.some((item) => item.name === "usedFn")).toBe(false);
  });

  it("treats an unused `const f = () => {}` as a dead function", async () => {
    const findings = await findingsOf(basicDir());
    expect(findings).toContainEqual(expect.objectContaining({ name: "constFn", type: "function" }));
  });

  it("reports an unused interface and type alias as dead_code", async () => {
    const findings = await findingsOf(basicDir());
    expect(findings).toContainEqual(
      expect.objectContaining({ name: "UnusedInterface", type: "interface" })
    );
    expect(findings).toContainEqual(
      expect.objectContaining({ name: "UnusedType", type: "interface" })
    );
  });

  it("keeps a class alive when instantiated via new", async () => {
    const findings = await findingsOf(basicDir());
    expect(findings.some((item) => item.name === "UsedViaNew")).toBe(false);
  });

  it("keeps a class alive when it is only used as a type annotation", async () => {
    const findings = await findingsOf(basicDir());
    expect(findings.some((item) => item.name === "UsedAsType")).toBe(false);
  });

  it("reports an unused private method as dead_code with type method", async () => {
    const findings = await findingsOf(basicDir());
    expect(findings).toContainEqual(
      expect.objectContaining({ name: "unusedPrivate", type: "method" })
    );
  });

  it("never reports an unused public method", async () => {
    const findings = await findingsOf(basicDir());
    expect(findings.some((item) => item.name === "publicMethod")).toBe(false);
  });

  it("reaches dead_code for a private method only on a directory scan without max_depth", async () => {
    const methodScopeDir = join(rootDir, "methodscope");

    const dirResponse = await handler({ path: methodScopeDir, limit: 100 });
    const dirResult = parseContent<DeadCodeResult>(dirResponse);
    expect(dirResult.dead_code).toContainEqual(
      expect.objectContaining({ name: "secret", type: "method" })
    );

    const fileResponse = await handler({
      path: join(methodScopeDir, "acct.ts"),
      limit: 100,
    });
    const fileResult = parseContent<DeadCodeResult>(fileResponse);
    expect(fileResult.dead_code.some((item) => item.name === "secret")).toBe(false);
    expect(fileResult.unreferenced_exports.some((item) => item.name === "secret")).toBe(true);
  });

  it("keeps a symbol alive when another file calls it", async () => {
    const findings = await findingsOf(join(rootDir, "crossfile"));
    expect(findings.some((item) => item.name === "crossUsed")).toBe(false);
  });

  it("keeps a symbol alive through an `export { x } from './y'` re-export", async () => {
    const findings = await findingsOf(join(rootDir, "reexport"));
    expect(findings.some((item) => item.name === "reExported")).toBe(false);
  });

  it("reports neither declaration when two files share a name and one call reaches it", async () => {
    const findings = await findingsOf(join(rootDir, "shadow"));
    expect(findings.some((item) => item.name === "shared")).toBe(false);
  });
});

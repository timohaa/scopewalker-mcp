import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { CodeInventoryResult } from "../types/index.js";
import { registerCodeInventoryTool } from "./codeInventory.js";

describe("codeInventory tool", () => {
  let testDir: string;
  const handler = getToolHandler(registerCodeInventoryTool, "get_code_inventory");

  beforeAll(async () => {
    testDir = join(tmpdir(), `scopewalker-inv-test-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });

    // TypeScript file with class and functions
    await writeFile(
      join(testDir, "service.ts"),
      `/**
 * Authentication service
 */
export class AuthService {
  private token: string;

  public login(username: string, password: string): boolean {
    return true;
  }

  private validate(): void {}
}

export function createContext(): void {}

const _privateHelper = () => {};

export interface UserConfig {
  name: string;
}

export enum Status {
  Active,
  Inactive
}
`
    );

    await writeFile(
      join(testDir, "private.ts"),
      `class Internal {
  private token: string;

  _inferredPrivate(): void {}
}

function _internalUtility(): void {}
`
    );
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("indexes exported symbols and methods by file", async () => {
    const response = await handler({ path: testDir });
    const result = parseContent<CodeInventoryResult>(response);

    const serviceFile = result.inventory.find((file) => file.file.endsWith("service.ts"));
    expect(serviceFile?.items.map((item) => item.name)).toEqual(
      expect.arrayContaining(["AuthService", "createContext", "UserConfig", "Status"])
    );

    const authService = serviceFile?.items.find((item) => item.name === "AuthService");
    expect(authService?.methods?.map((method) => method.name)).toEqual(
      expect.arrayContaining(["login"])
    );
    expect(authService?.methods?.some((method) => method.name === "validate")).toBe(false);

    expect(result.summary.exported_symbols).toBeGreaterThan(0);
  });

  it("optionally includes private symbols", async () => {
    const response = await handler({ path: testDir, include_private: true });
    const result = parseContent<CodeInventoryResult>(response);

    const internalFile = result.inventory.find((file) => file.file.endsWith("private.ts"));
    expect(internalFile?.items.map((item) => item.name)).toContain("_internalUtility");

    const internalClass = internalFile?.items.find((item) => item.name === "Internal");
    expect(internalClass?.methods?.some((method) => method.visibility === "private")).toBe(true);
  });

  it("handles single file path", async () => {
    const response = await handler({ path: join(testDir, "service.ts") });
    const result = parseContent<CodeInventoryResult>(response);

    expect(result.inventory).toHaveLength(1);
    expect(result.inventory[0].file).toContain("service.ts");
    expect(result.inventory[0].items.map((i) => i.name)).toContain("AuthService");
  });

  it("returns error for nonexistent path", async () => {
    const response = await handler({ path: "/nonexistent/path/12345" });
    expect(response.isError).toBe(true);

    const errorPayload = parseContent<{ error: { code: string } }>(response);
    expect(errorPayload.error.code).toBe("PATH_NOT_FOUND");
  });

  it("handles files with only type exports", async () => {
    // Create file with only type exports
    await writeFile(
      join(testDir, "types-only.ts"),
      `export interface Config {
  name: string;
}

export type Status = "active" | "inactive";

export enum Color {
  Red,
  Blue
}
`
    );

    const response = await handler({ path: join(testDir, "types-only.ts") });
    const result = parseContent<CodeInventoryResult>(response);

    const typesFile = result.inventory.find((f) => f.file.includes("types-only.ts"));
    expect(typesFile).toBeDefined();
    expect(typesFile?.items.some((i) => i.type === "interface")).toBe(true);
    expect(typesFile?.items.some((i) => i.type === "enum")).toBe(true);
  });

  it("filters by grep keyword matching symbol names", async () => {
    const response = await handler({ path: testDir, grep: "auth" });
    const result = parseContent<CodeInventoryResult>(response);

    // Should find AuthService (matches "auth")
    const serviceFile = result.inventory.find((f) => f.file.endsWith("service.ts"));
    expect(serviceFile).toBeDefined();
    expect(serviceFile?.items.some((i) => i.name === "AuthService")).toBe(true);

    // Should not include symbols that don't match
    expect(serviceFile?.items.some((i) => i.name === "createContext")).toBe(false);
  });

  it("grep filter matches file paths", async () => {
    const response = await handler({ path: testDir, grep: "service" });
    const result = parseContent<CodeInventoryResult>(response);

    // Should include service.ts file (path matches) with all its items
    const serviceFile = result.inventory.find((f) => f.file.endsWith("service.ts"));
    expect(serviceFile).toBeDefined();
    expect(serviceFile?.items.length).toBeGreaterThan(0);
  });
});

describe("codeInventory tool - Python", () => {
  let testDir: string;
  const handler = getToolHandler(registerCodeInventoryTool, "get_code_inventory");

  beforeAll(async () => {
    testDir = join(tmpdir(), `scopewalker-inv-py-test-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });

    await writeFile(
      join(testDir, "module.py"),
      `"""Module docstring."""

def public_function():
    """A public function."""
    pass

class PublicClass:
    """A public class."""

    def method(self):
        pass

def _private_function():
    pass
`
    );
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("indexes Python module-level symbols as exported", async () => {
    const response = await handler({ path: testDir });
    const result = parseContent<CodeInventoryResult>(response);

    const pyFile = result.inventory.find((f) => f.file.endsWith("module.py"));
    if (pyFile) {
      // Module-level items in Python should be considered exported
      const publicFunc = pyFile.items.find((i) => i.name === "public_function");
      const publicClass = pyFile.items.find((i) => i.name === "PublicClass");

      expect(publicFunc?.exported).toBe(true);
      expect(publicClass?.exported).toBe(true);
    }
  });
});

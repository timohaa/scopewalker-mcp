import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { PropDrillingResult } from "../types/propDrilling.js";
import { registerPropDrillingTool } from "./propDrilling.js";

const handler = getToolHandler(registerPropDrillingTool, "get_prop_drilling");
let testDir: string;

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-propdrilling-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });

  // React-style prop drilling chain: Page → Layout → Sidebar → UserMenu
  await writeFile(
    join(testDir, "Page.tsx"),
    `export function Page({ userId }: { userId: string }) {
  return <Layout userId={userId} />;
}
`
  );

  await writeFile(
    join(testDir, "Layout.tsx"),
    `export function Layout({ userId }: { userId: string }) {
  return <Sidebar userId={userId} />;
}
`
  );

  await writeFile(
    join(testDir, "Sidebar.tsx"),
    `export function Sidebar({ userId }: { userId: string }) {
  return <UserMenu userId={userId} />;
}
`
  );

  await writeFile(
    join(testDir, "UserMenu.tsx"),
    `export function UserMenu({ userId }: { userId: string }) {
  return <span>{userId}</span>;
}
`
  );

  // Plain TS function chain
  await writeFile(
    join(testDir, "utils.ts"),
    `export function processRequest(token: string) {
  return validateToken(token);
}

export function validateToken(token: string) {
  return checkAuth(token);
}

export function checkAuth(token: string) {
  return token.length > 0;
}
`
  );
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("core functionality", () => {
  it("detects prop drilling across TSX components", async () => {
    const response = await handler({ path: testDir, min_occurrences: 3 });
    const result = parseContent<PropDrillingResult>(response);

    expect(result.is_directory).toBe(true);
    expect(result.summary.files_analyzed).toBeGreaterThan(0);

    const userId = result.threaded_parameters.find((p) => p.name === "userId");
    expect(userId).toBeDefined();
    expect(userId?.occurrences).toBeGreaterThanOrEqual(4);
    expect(userId?.forwarding_evidence).toBeGreaterThanOrEqual(3);
  });

  it("detects parameter threading in plain TS functions", async () => {
    const response = await handler({ path: testDir, min_occurrences: 3 });
    const result = parseContent<PropDrillingResult>(response);

    const token = result.threaded_parameters.find((p) => p.name === "token");
    expect(token).toBeDefined();
    expect(token?.occurrences).toBe(3);
    expect(token?.forwarding_evidence).toBeGreaterThanOrEqual(2);
  });
});

describe("filtering", () => {
  it("applies min_occurrences threshold", async () => {
    const response = await handler({ path: testDir, min_occurrences: 5 });
    const result = parseContent<PropDrillingResult>(response);

    // Nothing should have 5+ occurrences
    expect(result.threaded_parameters.length).toBe(0);
    expect(result.summary.threaded_parameters_found).toBe(0);
  });

  it("applies exclude_common filter", async () => {
    // Create file with a "common" parameter name
    await writeFile(join(testDir, "common1.ts"), `function a(id: string) { return b(id); }`);
    await writeFile(join(testDir, "common2.ts"), `function c(id: string) { return d(id); }`);
    await writeFile(join(testDir, "common3.ts"), `function e(id: string) { return f(id); }`);

    const withCommon = await handler({ path: testDir, min_occurrences: 3 });
    const resultWith = parseContent<PropDrillingResult>(withCommon);
    const idWith = resultWith.threaded_parameters.find((p) => p.name === "id");

    const withoutCommon = await handler({
      path: testDir,
      min_occurrences: 3,
      exclude_common: true,
    });
    const resultWithout = parseContent<PropDrillingResult>(withoutCommon);
    const idWithout = resultWithout.threaded_parameters.find((p) => p.name === "id");

    // With common names, "id" should appear; without, it should be filtered
    if (idWith !== undefined) {
      expect(idWithout).toBeUndefined();
    }
  });

  it("applies limit parameter", async () => {
    const response = await handler({ path: testDir, min_occurrences: 3, limit: 1 });
    const result = parseContent<PropDrillingResult>(response);

    expect(result.threaded_parameters.length).toBeLessThanOrEqual(1);
  });
});

describe("summary_only mode", () => {
  it("returns empty threaded_parameters but populated summary", async () => {
    const response = await handler({
      path: testDir,
      min_occurrences: 3,
      summary_only: true,
    });
    const result = parseContent<PropDrillingResult>(response);

    expect(result.threaded_parameters).toEqual([]);
    expect(result.summary.threaded_parameters_found).toBeGreaterThan(0);
    expect(result.summary.files_analyzed).toBeGreaterThan(0);
  });
});

describe("path handling", () => {
  it("handles single file path", async () => {
    const response = await handler({ path: join(testDir, "utils.ts") });
    const result = parseContent<PropDrillingResult>(response);

    expect(result.is_directory).toBe(false);
    expect(result.summary.files_analyzed).toBe(1);
  });

  it("handles invalid path gracefully", async () => {
    const response = await handler({ path: "/nonexistent/path/to/file.ts" });

    expect(response.isError).toBe(true);
  });
});

describe("edge cases", () => {
  it("handles empty directory", async () => {
    const emptyDir = join(testDir, "empty");
    await mkdir(emptyDir, { recursive: true });

    const response = await handler({ path: emptyDir });
    const result = parseContent<PropDrillingResult>(response);

    expect(result.summary.files_analyzed).toBe(0);
    expect(result.threaded_parameters).toEqual([]);
    expect(result.summary.threaded_parameters_found).toBe(0);
  });

  it("handles destructured props", async () => {
    const destructuredDir = join(testDir, "destructured");
    await mkdir(destructuredDir, { recursive: true });

    await writeFile(
      join(destructuredDir, "A.tsx"),
      `function A({ sessionId, locale }: Props) { return B(sessionId, locale); }`
    );
    await writeFile(
      join(destructuredDir, "B.tsx"),
      `function B({ sessionId, locale }: Props) { return C(sessionId, locale); }`
    );
    await writeFile(
      join(destructuredDir, "C.tsx"),
      `function C({ sessionId, locale }: Props) { return sessionId + locale; }`
    );

    const response = await handler({ path: destructuredDir, min_occurrences: 3 });
    const result = parseContent<PropDrillingResult>(response);

    const sessionId = result.threaded_parameters.find((p) => p.name === "sessionId");
    expect(sessionId).toBeDefined();
    expect(sessionId?.occurrences).toBe(3);

    const locale = result.threaded_parameters.find((p) => p.name === "locale");
    expect(locale).toBeDefined();
    expect(locale?.occurrences).toBe(3);
  });
});

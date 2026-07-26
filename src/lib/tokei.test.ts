import { mkdir, rm, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { TokeiOutput } from "./tokei.js";
import { analyze } from "./tokei.js";

let testDir: string;

/** Flattens all per-file report names across languages ("Total" carries no reports). */
function reportNames(data: TokeiOutput): string[] {
  return Object.values(data).flatMap((lang) => lang.reports.map((report) => report.name));
}

beforeAll(async () => {
  const tempPath = join(tmpdir(), `scopewalker-tokei-test-${String(Date.now())}`);
  await mkdir(tempPath, { recursive: true });
  testDir = await realpath(tempPath);

  await writeFile(join(testDir, "component.tsx"), "export const App = () => <div />;\n");
  await writeFile(join(testDir, "widget.jsx"), "export const Widget = () => <span />;\n");
  await writeFile(join(testDir, "util.ts"), "export const x: number = 1;\n");
  await writeFile(join(testDir, "main.zig"), "pub fn main() void {}\n");
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("analyze - extension filtering", () => {
  it("maps tsx to tokei's TSX language and returns its entries", async () => {
    const result = await analyze(testDir, { extensions: ["tsx"] });
    expect(result.success).toBe(true);
    if (result.success) {
      const names = reportNames(result.data);
      expect(names.some((name) => name.endsWith("component.tsx"))).toBe(true);
      expect(names.some((name) => name.endsWith("util.ts"))).toBe(false);
      expect(result.data.TSX.reports).toHaveLength(1);
    }
  });

  it("maps jsx to tokei's JSX language and returns its entries", async () => {
    const result = await analyze(testDir, { extensions: ["jsx"] });
    expect(result.success).toBe(true);
    if (result.success) {
      const names = reportNames(result.data);
      expect(names.some((name) => name.endsWith("widget.jsx"))).toBe(true);
      expect(names.some((name) => name.endsWith("component.tsx"))).toBe(false);
    }
  });

  it("passes unmapped extensions through so only matching files are counted", async () => {
    const result = await analyze(testDir, { extensions: ["zig"] });
    expect(result.success).toBe(true);
    if (result.success) {
      const names = reportNames(result.data);
      expect(names.some((name) => name.endsWith("main.zig"))).toBe(true);
      expect(names.some((name) => name.endsWith("util.ts"))).toBe(false);
      expect(names.some((name) => name.endsWith("component.tsx"))).toBe(false);
    }
  });

  it("returns an empty result for a truly unknown extension instead of all languages", async () => {
    const result = await analyze(testDir, { extensions: ["nosuchlang"] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(reportNames(result.data)).toHaveLength(0);
    }
  });
});

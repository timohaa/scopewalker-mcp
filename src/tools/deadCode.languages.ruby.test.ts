import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { DeadCodeResult } from "../types/index.js";
import { registerDeadCodeTool } from "./deadCode.js";

const handler = getToolHandler(registerDeadCodeTool, "find_dead_code");

describe("find_dead_code - Ruby", () => {
  let dir: string;

  beforeAll(async () => {
    dir = join(tmpdir(), `scopewalker-dead-rb-${String(Date.now())}`);
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, "calc.rb"),
      `def top_level_unused
  1
end

class Widget
  def open
  end

  private

  def hidden_unused
    2
  end
end

instance = Widget.new
`
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("marks a top-level def as unreferenced_exports", async () => {
    const response = await handler({ path: dir, limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    expect(result.unreferenced_exports.some((item) => item.name === "top_level_unused")).toBe(true);
  });

  it("marks a private-section method as dead_code when scanning its directory", async () => {
    const response = await handler({ path: dir, limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    expect(result.dead_code).toContainEqual(
      expect.objectContaining({ name: "hidden_unused", type: "method" })
    );
  });

  it("keeps a class alive when instantiated via .new", async () => {
    const response = await handler({ path: dir, limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    const findings = [...result.dead_code, ...result.unreferenced_exports];
    expect(findings.some((item) => item.name === "Widget")).toBe(false);
  });
});

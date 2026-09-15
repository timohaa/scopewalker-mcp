import { mkdir, rm, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { LineCountsResult } from "../types/index.js";
import { registerLineCountsTool } from "./lineCounts.js";

let testDir: string;
const handler = getToolHandler(registerLineCountsTool, "get_line_counts");

beforeAll(async () => {
  const tempPath = join(tmpdir(), `scopewalker-lines-hcl-${String(Date.now())}`);
  await mkdir(tempPath, { recursive: true });
  testDir = await realpath(tempPath);
  await writeFile(join(testDir, "main.tf"), 'resource "null_resource" "example" {}\n');
  await writeFile(join(testDir, "config.hcl"), 'name = "example"\n');
  await writeFile(join(testDir, "values.tfvars"), 'region = "eu-west-1"\n');
  await writeFile(join(testDir, "unrelated.ts"), "export const value = 1;\n");
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("get_line_counts - HCL extension filters", () => {
  it("maps hcl, tf, and tfvars filters to HCL and returns Terraform line counts", async () => {
    for (const extension of [".hcl", ".tf", ".tfvars"]) {
      const response = await handler({ path: testDir, extensions: [extension], sort_by: "name" });
      expect(response.isError).toBeUndefined();
      const result = parseContent<LineCountsResult>(response);

      // Tokei filters by language, so each extension selects all three HCL files.
      expect(result.files.map((file) => file.path)).toEqual([
        "config.hcl",
        "main.tf",
        "values.tfvars",
      ]);
      expect(result.summary.total_files).toBe(3);
      expect(result.summary.total_code_lines).toBe(3);
    }
  });
});

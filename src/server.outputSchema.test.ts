import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "./server.js";

/**
 * Calls every tool through a real client. Unlike the direct-handler harness,
 * this runs the SDK's output validation on both sides: the server checks
 * structuredContent against the Zod schema, and the client checks it against
 * the JSON Schema advertised in tools/list. Schema drift fails either check.
 */

const FIXTURES = join(process.cwd(), "src/__fixtures__");

/** Arguments that exercise each tool's alternative result shapes. */
const CALLS: { name: string; arguments: Record<string, unknown> }[] = [
  { name: "get_line_counts", arguments: {} },
  { name: "get_functions", arguments: { detail: "counts" } },
  { name: "get_functions", arguments: { detail: "lines" } },
  { name: "check_thresholds", arguments: { max_file_lines: 1, max_function_lines: 1 } },
  { name: "get_code_inventory", arguments: { include_private: true } },
  { name: "get_code_smells", arguments: { include_text: true } },
  { name: "get_complexity_metrics", arguments: {} },
  { name: "get_complexity_metrics", arguments: { summary_only: true } },
  { name: "get_documentation_coverage", arguments: { limit: 1 } },
  { name: "get_documentation_coverage", arguments: { summary_only: true } },
  { name: "get_prop_drilling", arguments: { min_occurrences: 1 } },
  { name: "get_prop_drilling", arguments: { summary_only: true } },
  { name: "find_dead_code", arguments: {} },
];

let client: Client;
let emptyDir: string;

beforeAll(async () => {
  emptyDir = await mkdtemp(join(tmpdir(), "scopewalker-output-schema-"));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "output-schema-test", version: "0.0.0" });
  await Promise.all([createServer().connect(serverTransport), client.connect(clientTransport)]);
  // callTool validates against schemas cached by listTools.
  await client.listTools();
});

afterAll(async () => {
  await client.close();
  await rm(emptyDir, { recursive: true, force: true });
});

describe("structured output", () => {
  it("advertises an object outputSchema without $schema for every tool", async () => {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.outputSchema?.type).toBe("object");
      expect(tool.outputSchema).not.toHaveProperty("$schema");
    }
  });

  it.each(CALLS)("$name $arguments matches its schema on fixtures", async (call) => {
    const result = await client.callTool({
      name: call.name,
      arguments: { path: FIXTURES, ...call.arguments },
    });

    expect(result.isError).not.toBe(true);
    const [text] = result.content as { type: string; text: string }[];
    expect(result.structuredContent).toEqual(JSON.parse(text?.text ?? ""));
  });

  it.each(CALLS)("$name $arguments matches its schema on an empty directory", async (call) => {
    const result = await client.callTool({
      name: call.name,
      arguments: { path: emptyDir, ...call.arguments },
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toBeDefined();
  });

  it("returns errors without structured content", async () => {
    const result = await client.callTool({
      name: "get_functions",
      arguments: { path: join(emptyDir, "missing") },
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });
});

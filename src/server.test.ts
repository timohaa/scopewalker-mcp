import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, SERVER_NAME } from "./server.js";

/** Every tool the server is expected to advertise, sorted. */
const EXPECTED_TOOLS = [
  "check_thresholds",
  "get_code_inventory",
  "get_code_smells",
  "get_complexity_metrics",
  "get_documentation_coverage",
  "get_functions",
  "get_line_counts",
  "get_prop_drilling",
];

let client: Client;
let tools: Awaited<ReturnType<Client["listTools"]>>["tools"];

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "server-test", version: "0.0.0" });

  await Promise.all([createServer().connect(serverTransport), client.connect(clientTransport)]);

  ({ tools } = await client.listTools());
});

afterAll(async () => {
  await client.close();
});

describe("createServer", () => {
  it("advertises every registered tool", () => {
    // An empty or partial list is how a renamed SDK _registeredTools field
    // would surface: the override would map over nothing and silently ship a
    // server with no tools.
    expect(tools.map((tool) => tool.name).sort()).toEqual(EXPECTED_TOOLS);
  });

  it("strips $schema from every tool inputSchema", () => {
    for (const tool of tools) {
      expect(tool.inputSchema).not.toHaveProperty("$schema");
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("preserves schema properties and descriptions through the override", () => {
    const complexity = tools.find((tool) => tool.name === "get_complexity_metrics");
    expect(complexity).toBeDefined();
    expect(complexity?.description).toBeTruthy();

    const properties = complexity?.inputSchema.properties;
    expect(properties).toBeDefined();
    expect(Object.keys(properties ?? {})).toEqual(
      expect.arrayContaining(["path", "limit", "summary_only", "max_files"])
    );
  });

  it("advertises the version from package.json", () => {
    // Guards the runtime readFileSync of ../package.json: a wrong relative
    // path throws at server construction rather than being caught at review.
    const { version } = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    ) as { version: string };

    expect(client.getServerVersion()?.name).toBe(SERVER_NAME);
    expect(client.getServerVersion()?.version).toBe(version);
  });
});

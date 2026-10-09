import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createServer } from "./server.js";

let rootA: string;
let rootB: string;
let client: Client | undefined;

beforeAll(async () => {
  rootA = await mkdtemp(join(tmpdir(), "scopewalker-roots-a-"));
  rootB = await mkdtemp(join(tmpdir(), "scopewalker-roots-b-"));
});

afterEach(async () => {
  await client?.close();
  client = undefined;
  delete process.env.SCOPEWALKER_ALLOWED_ROOTS;
});

afterAll(async () => {
  await rm(rootA, { recursive: true, force: true });
  await rm(rootB, { recursive: true, force: true });
});

/** Connects a client that declares the roots capability and answers roots/list. */
async function connectWithRoots(roots: { current: string[] }): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const connected = new Client(
    { name: "roots-test", version: "0.0.0" },
    { capabilities: { roots: { listChanged: true } } }
  );
  connected.setRequestHandler(ListRootsRequestSchema, () => ({
    roots: roots.current.map((dir) => ({ uri: pathToFileURL(dir).href })),
  }));
  await Promise.all([createServer().connect(serverTransport), connected.connect(clientTransport)]);
  return connected;
}

/** Returns the error code of a get_line_counts call, or undefined when it succeeds. */
async function errorCodeFor(connected: Client, path: string): Promise<string | undefined> {
  const result = await connected.callTool({ name: "get_line_counts", arguments: { path } });
  if (result.isError !== true) return undefined;
  const [block] = result.content as { text: string }[];
  return (JSON.parse(block?.text ?? "{}") as { error: { code: string } }).error.code;
}

describe("client roots", () => {
  it("confines tools to the roots the client shares", async () => {
    client = await connectWithRoots({ current: [rootA] });

    expect(await errorCodeFor(client, rootA)).toBeUndefined();
    // The working directory is a default root, but not once the client names its own.
    expect(await errorCodeFor(client, process.cwd())).toBe("PERMISSION_DENIED");
  });

  it("follows roots/list_changed notifications", async () => {
    const roots = { current: [rootA] };
    client = await connectWithRoots(roots);
    expect(await errorCodeFor(client, rootB)).toBe("PERMISSION_DENIED");

    roots.current = [rootB];
    await client.sendRootsListChanged();

    expect(await errorCodeFor(client, rootB)).toBeUndefined();
    expect(await errorCodeFor(client, rootA)).toBe("PERMISSION_DENIED");
  });

  it("falls back to the default roots when roots/list fails", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "roots-test", version: "0.0.0" }, { capabilities: { roots: {} } });
    client.setRequestHandler(ListRootsRequestSchema, () => {
      throw new Error("roots unavailable");
    });
    const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await Promise.all([createServer().connect(serverTransport), client.connect(clientTransport)]);

    expect(await errorCodeFor(client, process.cwd())).toBeUndefined();
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining("client roots"), expect.anything());
    stderr.mockRestore();
  });

  it("lets SCOPEWALKER_ALLOWED_ROOTS override the client's roots", async () => {
    process.env.SCOPEWALKER_ALLOWED_ROOTS = rootB;
    client = await connectWithRoots({ current: [rootA] });

    expect(await errorCodeFor(client, rootB)).toBeUndefined();
    expect(await errorCodeFor(client, rootA)).toBe("PERMISSION_DENIED");
  });
});

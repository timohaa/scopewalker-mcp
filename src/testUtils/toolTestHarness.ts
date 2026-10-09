import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "../utils/clientRoots.js";

/** Context for handlers invoked without a connected client, so no client roots exist. */
const NO_CLIENT_ROOTS: ToolContext = {
  getClientRoots: () => Promise.resolve(undefined),
};

export interface ToolResponse {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResponse>;

/** A registered tool record from the SDK's private registry. */
interface RegisteredToolRecord {
  handler: (args: Record<string, unknown>, extra: Record<string, never>) => Promise<ToolResponse>;
}

/** Narrows an SDK registry entry to one holding a directly callable handler. */
function isRegisteredToolRecord(value: unknown): value is RegisteredToolRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "handler" in value &&
    typeof value.handler === "function"
  );
}

/** Registers a tool on a real server and returns its handler for direct invocation in tests. */
export function getToolHandler(
  registerToolFn: (server: McpServer, context: ToolContext) => void,
  toolName: string
): ToolHandler {
  const server = new McpServer({ name: "tool-test-harness", version: "0.0.0" });
  registerToolFn(server, NO_CLIENT_ROOTS);

  const registry: unknown = Reflect.get(server, "_registeredTools");
  const tool: unknown =
    typeof registry === "object" && registry !== null
      ? Object.entries(registry).find(([name]) => name === toolName)?.[1]
      : undefined;
  if (!isRegisteredToolRecord(tool)) {
    throw new Error(`Tool ${toolName} was not registered`);
  }

  return (args) => tool.handler(args, {});
}

/** Parses JSON content from a tool response. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T used for caller's type inference
export function parseContent<T>(response: ToolResponse): T {
  return JSON.parse(firstItem(response.content).text) as T;
}

/** Returns the first item, failing the test when the list is empty. */
export function firstItem<T>(items: readonly T[]): T {
  const [first] = items;
  if (first === undefined) {
    throw new Error("Expected at least one item");
  }
  return first;
}

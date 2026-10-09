import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

/** Mock MCP server that captures registered tools for testing. */
class ToolTestServer {
  tools = new Map<string, ToolHandler>();

  /** Records the handler under its tool name; the config is not needed to invoke it. */
  registerTool(name: string, _schema: unknown, handler: ToolHandler): void {
    this.tools.set(name, handler);
  }
}

/** Registers a tool and returns its handler for direct invocation in tests. */
export function getToolHandler(
  registerToolFn: (server: McpServer, context: ToolContext) => void,
  toolName: string
): ToolHandler {
  const server = new ToolTestServer();
  registerToolFn(server as unknown as McpServer, NO_CLIENT_ROOTS);

  const handler = server.tools.get(toolName);
  if (!handler) {
    throw new Error(`Tool ${toolName} was not registered`);
  }

  return handler;
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

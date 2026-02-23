import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface ToolResponse {
  content: { type: string; text: string }[];
  isError?: boolean;
}

type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResponse>;

/** Mock MCP server that captures registered tools for testing. */
class ToolTestServer {
  tools = new Map<string, ToolHandler>();

  registerTool(name: string, _schema: unknown, handler: ToolHandler): void {
    this.tools.set(name, handler);
  }
}

/** Registers a tool and returns its handler for direct invocation in tests. */
export function getToolHandler(
  registerToolFn: (server: McpServer) => void,
  toolName: string
): ToolHandler {
  const server = new ToolTestServer();
  registerToolFn(server as unknown as McpServer);

  const handler = server.tools.get(toolName);
  if (!handler) {
    throw new Error(`Tool ${toolName} was not registered`);
  }

  return handler;
}

/** Parses JSON content from a tool response. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- T used for caller's type inference
export function parseContent<T>(response: ToolResponse): T {
  if (response.content.length === 0) {
    throw new Error("Response content is empty");
  }
  return JSON.parse(response.content[0].text) as T;
}

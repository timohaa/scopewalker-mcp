#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import { toJSONSchema } from "zod";
import { registerCheckThresholdsTool } from "./tools/checkThresholds.js";
import { registerCodeInventoryTool } from "./tools/codeInventory.js";
import { registerCodeSmellsTool } from "./tools/codeSmells.js";
import { registerComplexityMetricsTool } from "./tools/complexityMetrics.js";
import { registerDocumentationCoverageTool } from "./tools/documentationCoverage.js";
import { registerFunctionsTool } from "./tools/functions.js";
import { registerLineCountsTool } from "./tools/lineCounts.js";
import { registerPropDrillingTool } from "./tools/propDrilling.js";

const server = new McpServer(
  {
    name: "scopewalker-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register all tools
registerLineCountsTool(server);
registerFunctionsTool(server);
registerCheckThresholdsTool(server);
registerCodeInventoryTool(server);
registerCodeSmellsTool(server);
registerComplexityMetricsTool(server);
registerDocumentationCoverageTool(server);
registerPropDrillingTool(server);

// The MCP SDK emits $schema in every tool inputSchema when converting Zod v4
// schemas via z4mini.toJSONSchema(..., { target: 'draft-7' }). Some API
// providers silently reject tool definitions that include $schema. Override
// the listTools handler to strip it before the response leaves the server.
interface McpRegisteredTool {
  description?: string;
  inputSchema: z.ZodType;
}
const registeredTools = (
  server as unknown as { _registeredTools: Record<string, McpRegisteredTool> }
)._registeredTools;
server.server.setRequestHandler(
  ListToolsRequestSchema,
  () =>
    ({
      tools: Object.entries(registeredTools).map(([name, tool]) => {
        const schema = toJSONSchema(tool.inputSchema, { target: "draft-7" }) as Record<
          string,
          unknown
        >;
        delete schema.$schema;
        return { name, description: tool.description, inputSchema: schema };
      }),
    }) as z.infer<typeof ListToolsResultSchema>
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Server error:", error);
  process.exit(1);
});

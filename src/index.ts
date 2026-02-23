#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("Server error:", error);
  process.exit(1);
});

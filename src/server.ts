import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

export const SERVER_NAME = "scopewalker-mcp";

interface McpRegisteredTool {
  description?: string;
  inputSchema: z.ZodType;
}

/**
 * Reads the published version from package.json.
 * Read at runtime rather than imported: a JSON import outside rootDir would
 * restructure dist/, and hardcoding drifts because the release workflow bumps
 * package.json without touching this file. src/ and dist/ are both one level
 * below the package root, so the relative path holds in dev and when published.
 */
function readVersion(): string {
  const { version } = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8")
  ) as { version: string };
  return version;
}

/**
 * Strips $schema from every tool's inputSchema in the tools/list response.
 * The MCP SDK emits $schema when converting Zod v4 schemas via
 * z4mini.toJSONSchema(..., { target: 'draft-7' }), and some API providers
 * silently reject tool definitions that include it. Reaches into the SDK's
 * private _registeredTools because there is no public accessor; src/server.test.ts
 * asserts the tool list stays populated so an SDK rename fails loudly.
 */
function applySchemaStrippingOverride(server: McpServer): void {
  const registeredTools = (
    server as unknown as { _registeredTools: Record<string, McpRegisteredTool> }
  )._registeredTools;

  server.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: Object.entries(registeredTools).map(([name, tool]) => {
      const schema = toJSONSchema(tool.inputSchema, { target: "draft-7" }) as Record<
        string,
        unknown
      >;
      delete schema.$schema;
      return { name, description: tool.description, inputSchema: schema };
    }),
  }));
}

/** Builds the MCP server with every tool registered and the $schema override applied. */
export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: readVersion(),
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  registerLineCountsTool(server);
  registerFunctionsTool(server);
  registerCheckThresholdsTool(server);
  registerCodeInventoryTool(server);
  registerCodeSmellsTool(server);
  registerComplexityMetricsTool(server);
  registerDocumentationCoverageTool(server);
  registerPropDrillingTool(server);

  applySchemaStrippingOverride(server);

  return server;
}

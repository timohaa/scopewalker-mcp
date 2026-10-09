import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import { toJSONSchema } from "zod";
import { registerCheckThresholdsTool } from "./tools/checkThresholds.js";
import { registerCodeInventoryTool } from "./tools/codeInventory.js";
import { registerCodeSmellsTool } from "./tools/codeSmells.js";
import { registerComplexityMetricsTool } from "./tools/complexityMetrics.js";
import { registerDeadCodeTool } from "./tools/deadCode.js";
import { registerDocumentationCoverageTool } from "./tools/documentationCoverage.js";
import { registerFunctionsTool } from "./tools/functions.js";
import { registerLineCountsTool } from "./tools/lineCounts.js";
import { registerPropDrillingTool } from "./tools/propDrilling.js";

export const SERVER_NAME = "scopewalker-mcp";

/** The fields of the SDK's private registered-tool record that tools/list reads. */
interface McpRegisteredTool {
  title?: string;
  description?: string;
  inputSchema: z.ZodType;
  outputSchema?: z.ZodType;
  annotations?: Tool["annotations"];
  execution?: Tool["execution"];
  _meta?: Tool["_meta"];
  enabled: boolean;
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

/** Converts a Zod schema to draft-7 JSON Schema without the $schema key. */
function toToolJsonSchema(schema: z.ZodType, io: "input" | "output"): Tool["inputSchema"] {
  const json = toJSONSchema(schema, { target: "draft-7", io }) as Record<string, unknown>;
  delete json.$schema;
  return json as Tool["inputSchema"];
}

/**
 * Strips $schema from every tool's input and output schema in the tools/list response.
 * The MCP SDK emits $schema when converting Zod v4 schemas via
 * z4mini.toJSONSchema(..., { target: 'draft-7' }), and some API providers
 * silently reject tool definitions that include it. Reaches into the SDK's
 * private _registeredTools because there is no public accessor; src/server.test.ts
 * asserts the tool list stays populated so an SDK rename fails loudly.
 * Mirrors the SDK's own handler otherwise: disabled tools are hidden, and title,
 * annotations, execution and _meta pass through unchanged.
 */
function applySchemaStrippingOverride(server: McpServer): void {
  const registeredTools = (
    server as unknown as { _registeredTools: Record<string, McpRegisteredTool> }
  )._registeredTools;

  server.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: Object.entries(registeredTools)
      .filter(([, tool]) => tool.enabled)
      .map(([name, tool]): Tool => {
        const { outputSchema, title, description, annotations, execution, _meta } = tool;
        return {
          name,
          ...(title !== undefined && { title }),
          ...(description !== undefined && { description }),
          inputSchema: toToolJsonSchema(tool.inputSchema, "input"),
          ...(outputSchema !== undefined && {
            outputSchema: toToolJsonSchema(outputSchema, "output"),
          }),
          ...(annotations !== undefined && { annotations }),
          ...(execution !== undefined && { execution }),
          ...(_meta !== undefined && { _meta }),
        };
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
  registerDeadCodeTool(server);

  applySchemaStrippingOverride(server);

  return server;
}

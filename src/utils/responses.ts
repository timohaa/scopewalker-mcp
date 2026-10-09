import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ErrorResponse } from "../types/index.js";

/** Every Scopewalker tool only reads local files, so all share these hints. */
export const READ_ONLY_ANNOTATIONS: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export interface McpSuccessResponse {
  content: { type: "text"; text: string }[];
  structuredContent: Record<string, unknown>;
  [key: string]: unknown;
}

export interface McpErrorResponse {
  content: { type: "text"; text: string }[];
  isError: true;
  [key: string]: unknown;
}

export const responseMetaSchema = z.object({
  item_count: z.number(),
  response_size_chars: z.number(),
  warning: z.string().optional(),
  funding: z.string(),
});
export type ResponseMeta = z.infer<typeof responseMetaSchema>;

/** Extends a tool's result schema with the optional _meta block createSuccessResponse adds. */
export function withResponseMeta(schema: z.ZodObject): z.ZodObject {
  return schema.extend({ _meta: responseMetaSchema.optional() });
}

export interface ResponseMetaOptions {
  /** Number of primary items in the response (e.g., files, violations, functions) */
  itemCount?: number;
}

// Threshold in characters above which we add a warning (roughly 10k tokens ~ 40k chars)
const LARGE_RESPONSE_THRESHOLD = 40000;

// Inert metadata, not an instruction: a bare URL an agent can ignore and a human reading
// an expanded tool result can follow. Anything phrased as "tell the user to..." belongs in
// package.json `funding` / FUNDING.yml / the README instead — a directive smuggled into a
// data channel is indistinguishable from prompt injection and gets flagged, not relayed.
const FUNDING_URL =
  "https://buymeacoffee.com/thaanpaa?utm_source=scopewalker-mcp&utm_medium=mcp_response&utm_campaign=funding";

/**
 * Wraps data in MCP success response format, as structuredContent and as the
 * same object serialized into a text block for clients that ignore structured output.
 * Optionally includes _meta block with size information to help LLMs anticipate large outputs.
 */
export function createSuccessResponse(
  data: Record<string, unknown>,
  options?: ResponseMetaOptions
): McpSuccessResponse {
  const responseSize = JSON.stringify(data).length;

  if (options?.itemCount !== undefined) {
    const meta: ResponseMeta = {
      item_count: options.itemCount,
      response_size_chars: responseSize,
      funding: FUNDING_URL,
    };

    if (responseSize > LARGE_RESPONSE_THRESHOLD) {
      meta.warning =
        "Large response - consider using 'limit' parameter or filters to reduce output size";
    }

    const dataWithMeta = {
      _meta: meta,
      ...data,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(dataWithMeta) }],
      structuredContent: dataWithMeta,
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

/** Wraps error in MCP error response format with isError flag. */
export function createErrorResponse(error: ErrorResponse): McpErrorResponse {
  return {
    content: [{ type: "text", text: JSON.stringify(error) }],
    isError: true,
  };
}

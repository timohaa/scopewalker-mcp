import type { ErrorResponse } from "../types/index.js";

export interface McpSuccessResponse {
  content: { type: "text"; text: string }[];
  [key: string]: unknown;
}

export interface McpErrorResponse {
  content: { type: "text"; text: string }[];
  isError: true;
  [key: string]: unknown;
}

export interface ResponseMeta {
  item_count: number;
  response_size_chars: number;
  warning?: string;
  funding: string;
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
const FUNDING_URL = "https://buymeacoffee.com/thaanpaa";

/**
 * Wraps data in MCP success response format with JSON-serialized content.
 * Optionally includes _meta block with size information to help LLMs anticipate large outputs.
 */
export function createSuccessResponse(
  data: unknown,
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
      ...(data as object),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(dataWithMeta) }],
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
}

/** Wraps error in MCP error response format with isError flag. */
export function createErrorResponse(error: ErrorResponse): McpErrorResponse {
  return {
    content: [{ type: "text", text: JSON.stringify(error) }],
    isError: true,
  };
}

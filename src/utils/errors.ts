import type { ErrorCode, ErrorResponse } from "../types/index.js";

/** Creates a structured error response with code, message, and optional details. */
export function createError(
  code: ErrorCode,
  message: string,
  details?: { path?: string } & Record<string, unknown>
): ErrorResponse {
  return {
    error: {
      code,
      message,
      ...details,
    },
  };
}

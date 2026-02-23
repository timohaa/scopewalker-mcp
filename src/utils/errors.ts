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

interface NodeError extends Error {
  code?: string;
}

/** Type guard for Node.js system errors that include an error code. */
export function isNodeError(err: unknown): err is NodeError {
  return err instanceof Error && "code" in err;
}

/** Converts file system errors to structured error responses. */
export function handleFileSystemError(err: unknown, path: string): ErrorResponse {
  if (isNodeError(err)) {
    if (err.code === "ENOENT") {
      return createError("PATH_NOT_FOUND", `Path does not exist: ${path}`, {
        path,
      });
    }
    if (err.code === "EACCES") {
      return createError("PERMISSION_DENIED", `Cannot access: ${path}`, {
        path,
      });
    }
    if (err.code === "ENOTDIR") {
      return createError("NOT_A_DIRECTORY", `Not a directory: ${path}`, {
        path,
      });
    }
    if (err.code === "EISDIR") {
      return createError("NOT_A_FILE", `Not a file: ${path}`, { path });
    }
  }
  // Log unexpected errors but return generic message
  console.error("Unexpected error:", err);
  return createError("PARSE_ERROR", "An unexpected error occurred", { path });
}

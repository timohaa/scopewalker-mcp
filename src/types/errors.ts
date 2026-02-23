export type ErrorCode =
  | "PATH_NOT_FOUND"
  | "NOT_A_DIRECTORY"
  | "NOT_A_FILE"
  | "PERMISSION_DENIED"
  | "UNSUPPORTED_LANGUAGE"
  | "PARSE_ERROR"
  | "GIT_NOT_FOUND"
  | "NOT_A_GIT_REPO"
  | "TOOL_NOT_AVAILABLE";

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    path?: string;
    details?: Record<string, unknown>;
  };
}

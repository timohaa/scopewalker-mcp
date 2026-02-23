import { describe, it, expect } from "vitest";
import { createError, isNodeError, handleFileSystemError } from "./errors.js";

describe("errors", () => {
  describe("createError", () => {
    it("creates error with code and message", () => {
      const error = createError("PATH_NOT_FOUND", "File not found");
      expect(error.error.code).toBe("PATH_NOT_FOUND");
      expect(error.error.message).toBe("File not found");
    });

    it("includes optional details", () => {
      const error = createError("PARSE_ERROR", "Failed to parse", {
        path: "/some/path",
        line: 42,
      });
      expect(error.error.path).toBe("/some/path");
      expect((error.error as Record<string, unknown>).line).toBe(42);
    });
  });

  describe("isNodeError", () => {
    it("returns true for Error with code property", () => {
      const err = new Error("test") as Error & { code: string };
      err.code = "ENOENT";
      expect(isNodeError(err)).toBe(true);
    });

    it("returns false for plain Error", () => {
      expect(isNodeError(new Error("test"))).toBe(false);
    });

    it("returns false for non-Error", () => {
      expect(isNodeError("string")).toBe(false);
      expect(isNodeError(null)).toBe(false);
    });
  });

  describe("handleFileSystemError", () => {
    it("handles ENOENT error", () => {
      const err = new Error("not found") as Error & { code: string };
      err.code = "ENOENT";
      const result = handleFileSystemError(err, "/missing/file");
      expect(result.error.code).toBe("PATH_NOT_FOUND");
    });

    it("handles EACCES error", () => {
      const err = new Error("permission denied") as Error & { code: string };
      err.code = "EACCES";
      const result = handleFileSystemError(err, "/protected/file");
      expect(result.error.code).toBe("PERMISSION_DENIED");
    });

    it("handles ENOTDIR error", () => {
      const err = new Error("not a directory") as Error & { code: string };
      err.code = "ENOTDIR";
      const result = handleFileSystemError(err, "/some/file");
      expect(result.error.code).toBe("NOT_A_DIRECTORY");
    });

    it("handles EISDIR error", () => {
      const err = new Error("is a directory") as Error & { code: string };
      err.code = "EISDIR";
      const result = handleFileSystemError(err, "/some/dir");
      expect(result.error.code).toBe("NOT_A_FILE");
    });

    it("handles unknown error", () => {
      const result = handleFileSystemError("unknown error", "/path");
      expect(result.error.code).toBe("PARSE_ERROR");
    });
  });
});

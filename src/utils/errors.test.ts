import { describe, it, expect } from "vitest";
import { createError } from "./errors.js";

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
});

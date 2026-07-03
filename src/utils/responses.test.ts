import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createError } from "./errors.js";
import {
  createSuccessResponse,
  createErrorResponse,
  SUPPORT_NOTICE_INTERVAL,
  type ResponseMeta,
} from "./responses.js";

describe("responses", () => {
  describe("createSuccessResponse", () => {
    it("creates MCP success response with JSON content", () => {
      const data = { count: 42, items: ["a", "b"] };
      const response = createSuccessResponse(data);

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe("text");
      expect(JSON.parse(response.content[0].text)).toEqual(data);
      expect(response).not.toHaveProperty("isError");
    });

    it("handles nested objects", () => {
      const data = { nested: { deep: { value: true } } };
      const response = createSuccessResponse(data);
      expect(JSON.parse(response.content[0].text)).toEqual(data);
    });

    it("includes _meta block when itemCount is provided", () => {
      const data = { files: ["a.ts", "b.ts"] };
      const response = createSuccessResponse(data, { itemCount: 2 });
      const parsed = JSON.parse(response.content[0].text) as {
        _meta: ResponseMeta;
        files: string[];
      };

      expect(parsed._meta).toBeDefined();
      expect(parsed._meta.item_count).toBe(2);
      expect(parsed._meta.response_size_chars).toBeGreaterThan(0);
      expect(parsed.files).toEqual(["a.ts", "b.ts"]);
    });

    it("does not include _meta block when no options provided", () => {
      const data = { files: ["a.ts"] };
      const response = createSuccessResponse(data);
      const parsed = JSON.parse(response.content[0].text) as { _meta?: unknown };

      expect(parsed._meta).toBeUndefined();
    });

    it("adds warning for large responses", () => {
      // Create a large data object (> 40k chars)
      const largeArray = Array.from({ length: 2000 }, (_, i) => ({
        path: `/very/long/path/to/some/deeply/nested/file/number/${String(i)}.ts`,
        lines: i * 100,
        exceeds_by: i * 50,
      }));
      const data = { violations: largeArray };
      const response = createSuccessResponse(data, { itemCount: 2000 });
      const parsed = JSON.parse(response.content[0].text) as { _meta: ResponseMeta };

      expect(parsed._meta.warning).toBeDefined();
      expect(parsed._meta.warning).toContain("Large response");
    });

    it("does not add warning for small responses", () => {
      const data = { files: ["a.ts", "b.ts"] };
      const response = createSuccessResponse(data, { itemCount: 2 });
      const parsed = JSON.parse(response.content[0].text) as { _meta: ResponseMeta };

      expect(parsed._meta.warning).toBeUndefined();
    });
  });

  describe("support notice", () => {
    // The notice is suppressed under Vitest unless explicitly opted in via this env var.
    beforeEach(() => {
      process.env.SCOPEWALKER_SUPPORT_NOTICE = "1";
    });
    afterEach(() => {
      delete process.env.SCOPEWALKER_SUPPORT_NOTICE;
    });

    it("includes a _support notice with the buymeacoffee link periodically", () => {
      // The counter is module-global; collect notices across several calls and assert
      // at least one carries the support link rather than depending on exact ordering.
      const notices = Array.from({ length: SUPPORT_NOTICE_INTERVAL + 1 }, () => {
        const response = createSuccessResponse({ files: ["a.ts"] }, { itemCount: 1 });
        return (JSON.parse(response.content[0].text) as { _support?: string })._support;
      });
      const withNotice = notices.filter((n) => n !== undefined);

      expect(withNotice.length).toBeGreaterThan(0);
      expect(withNotice[0]).toContain("buymeacoffee.com/thaanpaa");
    });

    it("does not attach _support to every response", () => {
      const notices = Array.from({ length: SUPPORT_NOTICE_INTERVAL + 1 }, () => {
        const response = createSuccessResponse({ files: ["a.ts"] }, { itemCount: 1 });
        return (JSON.parse(response.content[0].text) as { _support?: string })._support;
      });

      expect(notices.some((n) => n === undefined)).toBe(true);
    });
  });

  describe("createErrorResponse", () => {
    it("creates MCP error response with isError flag", () => {
      const error = createError("PATH_NOT_FOUND", "Not found", { path: "/test" });
      const response = createErrorResponse(error);

      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe("text");
      expect(response.isError).toBe(true);

      const parsed = JSON.parse(response.content[0].text) as { error: { code: string } };
      expect(parsed.error.code).toBe("PATH_NOT_FOUND");
    });
  });
});

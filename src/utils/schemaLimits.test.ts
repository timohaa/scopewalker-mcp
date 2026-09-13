import { describe, expect, it } from "vitest";
import {
  MAX_FILES_CEILING,
  MAX_DEPTH_CEILING,
  LIMIT_CEILING,
  MAX_ARRAY_LENGTH,
  maxFilesSchema,
  maxDepthSchema,
  limitSchema,
  ignorePatternsSchema,
  extensionsSchema,
} from "./schemaLimits.js";

describe("boundedInt schemas", () => {
  const cases = [
    { name: "maxFilesSchema", schema: maxFilesSchema, ceiling: MAX_FILES_CEILING },
    { name: "maxDepthSchema", schema: maxDepthSchema, ceiling: MAX_DEPTH_CEILING },
    { name: "limitSchema", schema: limitSchema, ceiling: LIMIT_CEILING },
  ];

  for (const { name, schema, ceiling } of cases) {
    describe(name, () => {
      it("accepts an in-range value", () => {
        expect(schema.safeParse(ceiling - 1).success).toBe(true);
      });

      it("accepts the ceiling itself", () => {
        expect(schema.safeParse(ceiling).success).toBe(true);
      });

      it("rejects a value one above the ceiling", () => {
        expect(schema.safeParse(ceiling + 1).success).toBe(false);
      });

      it("accepts undefined", () => {
        expect(schema.safeParse(undefined).success).toBe(true);
      });
    });
  }
});

describe("ignorePatternsSchema", () => {
  it("accepts an in-range array", () => {
    expect(ignorePatternsSchema.safeParse(["node_modules", "dist"]).success).toBe(true);
  });

  it("accepts undefined", () => {
    expect(ignorePatternsSchema.safeParse(undefined).success).toBe(true);
  });

  it("rejects an array one above the max length", () => {
    const patterns = Array.from({ length: MAX_ARRAY_LENGTH + 1 }, (_, i) => `pattern-${String(i)}`);
    expect(ignorePatternsSchema.safeParse(patterns).success).toBe(false);
  });

  it("rejects an absolute path instead of silently matching nothing (L5)", () => {
    const result = ignorePatternsSchema.safeParse(["/Users/you/project/vendor"]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("relative");
    }
  });

  it("rejects an unexpanded ~ home-directory pattern", () => {
    expect(ignorePatternsSchema.safeParse(["~/project/vendor"]).success).toBe(false);
  });

  it("accepts a relative glob pattern that merely mentions vendor", () => {
    expect(ignorePatternsSchema.safeParse(["**/vendor/**", "vendor"]).success).toBe(true);
  });
});

describe("extensionsSchema", () => {
  it("accepts plain extension tokens with or without a leading dot", () => {
    expect(extensionsSchema.safeParse(["ts", ".tsx"]).success).toBe(true);
  });

  it("accepts undefined", () => {
    expect(extensionsSchema.safeParse(undefined).success).toBe(true);
  });

  it("rejects a token carrying glob/path syntax", () => {
    expect(extensionsSchema.safeParse(["ts,../x"]).success).toBe(false);
  });
});

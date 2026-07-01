import { stat, realpath } from "node:fs/promises";
import type * as fsModule from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it, expect, afterEach, vi } from "vitest";
import { validatePath, validateDirectory, validateFile } from "./paths.js";

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof fsModule>("node:fs/promises");
  return {
    ...actual,
    stat: vi.fn(actual.stat),
    realpath: vi.fn(actual.realpath),
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("validatePath", () => {
  it("returns valid result for existing file", async () => {
    const result = await validatePath("./package.json");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.isDirectory).toBe(false);
      expect(result.resolvedPath).toBe(resolve("./package.json"));
    }
  });

  it("returns valid result for existing directory", async () => {
    const result = await validatePath("./src");
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.isDirectory).toBe(true);
    }
  });

  it("returns error for non-existent path", async () => {
    const result = await validatePath("./nonexistent-path-12345");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.error.code).toBe("PATH_NOT_FOUND");
    }
  });

  it("returns permission error for inaccessible paths", async () => {
    const fakePath = resolve("./restricted-path");
    vi.mocked(realpath).mockResolvedValueOnce(fakePath);
    vi.mocked(stat).mockRejectedValueOnce(
      Object.assign(new Error("no access"), { code: "EACCES" })
    );

    const result = await validatePath("./restricted-path");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.error.code).toBe("PERMISSION_DENIED");
    }
  });

  it("returns parse error for unexpected failures", async () => {
    const fakePath = resolve("./error-path");
    vi.mocked(realpath).mockResolvedValueOnce(fakePath);
    vi.mocked(stat).mockRejectedValueOnce(new Error("unexpected failure"));

    const result = await validatePath("./error-path");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.error.code).toBe("PARSE_ERROR");
    }
  });
});

describe("validateDirectory", () => {
  it("returns valid result for directory", async () => {
    const result = await validateDirectory("./src");
    expect(result.valid).toBe(true);
  });

  it("returns error for file path", async () => {
    const result = await validateDirectory("./package.json");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.error.code).toBe("NOT_A_DIRECTORY");
    }
  });

  it("returns error for non-existent path", async () => {
    const result = await validateDirectory("./nonexistent-12345");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.error.code).toBe("PATH_NOT_FOUND");
    }
  });
});

describe("validateFile", () => {
  it("returns valid result for file", async () => {
    const result = await validateFile("./package.json");
    expect(result.valid).toBe(true);
  });

  it("returns error for directory path", async () => {
    const result = await validateFile("./src");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.error.code).toBe("NOT_A_FILE");
    }
  });

  it("returns error for non-existent path", async () => {
    const result = await validateFile("./nonexistent-file-9876");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.error.code).toBe("PATH_NOT_FOUND");
    }
  });
});

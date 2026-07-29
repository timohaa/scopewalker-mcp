import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyze } from "./tokei.js";

// tokei.ts promisifies execFile at module scope, so the mock must be hoisted
// above the import. It also has to carry promisify's custom symbol: the real
// execFile uses it to resolve { stdout, stderr }, and a bare vi.fn() would fall
// back to default semantics that resolve stdout alone, leaving the destructure
// in analyze() reading undefined.
const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));

vi.mock("node:child_process", () => {
  const execFile = Object.assign(vi.fn(), {
    [Symbol.for("nodejs.util.promisify.custom")]: execFileMock,
  });
  return { execFile, default: { execFile } };
});

let originalConsoleError: typeof console.error;

beforeEach(() => {
  execFileMock.mockReset();
  originalConsoleError = console.error;
  console.error = vi.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
});

describe("analyze - failure paths", () => {
  it("reports a missing tokei binary as TOOL_NOT_AVAILABLE with install instructions", async () => {
    execFileMock.mockRejectedValue(
      Object.assign(new Error("spawn tokei ENOENT"), { code: "ENOENT" })
    );

    const result = await analyze("/some/path");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.error.code).toBe("TOOL_NOT_AVAILABLE");
      expect(result.error.error.message).toContain("brew install tokei");
    }
  });

  it("reports a non-ENOENT exec failure as PARSE_ERROR and logs it", async () => {
    execFileMock.mockRejectedValue(Object.assign(new Error("killed"), { code: 1 }));

    const result = await analyze("/some/path");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.error.code).toBe("PARSE_ERROR");
    }
    expect(console.error).toHaveBeenCalled();
  });

  it("reports unparseable stdout as PARSE_ERROR", async () => {
    execFileMock.mockResolvedValue({ stdout: "not json", stderr: "" });

    const result = await analyze("/some/path");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.error.code).toBe("PARSE_ERROR");
    }
  });

  it("treats a non-Error rejection as PARSE_ERROR rather than a missing binary", async () => {
    // Exercises the isExecError type guard's false arm: without the Error
    // instance check, reading .code off a string would misclassify this.
    execFileMock.mockRejectedValue("something threw a string");

    const result = await analyze("/some/path");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.error.code).toBe("PARSE_ERROR");
    }
  });
});

describe("analyze - argument construction", () => {
  beforeEach(() => {
    execFileMock.mockResolvedValue({ stdout: "{}", stderr: "" });
  });

  /** Returns the argv tokei was invoked with on the most recent call. */
  function lastArgs(): string[] {
    const call = execFileMock.mock.calls.at(-1);
    expect(call).toBeDefined();
    return (call?.[1] ?? []) as string[];
  }

  it("passes --hidden only when includeHidden is set", async () => {
    await analyze("/some/path", { includeHidden: true });
    expect(lastArgs()).toContain("--hidden");

    await analyze("/some/path");
    expect(lastArgs()).not.toContain("--hidden");
  });

  it("passes one -e flag per exclude pattern", async () => {
    await analyze("/some/path", { exclude: ["dist", "vendor"] });

    const args = lastArgs();
    expect(args.filter((arg) => arg === "-e")).toHaveLength(2);
    expect(args).toContain("dist");
    expect(args).toContain("vendor");
  });
});

import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyze } from "./tokei.js";

// tokei.ts spawns the process directly, so the mock must be hoisted above the import.
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock("node:child_process", () => ({ spawn: spawnMock }));

/** A fake ChildProcess: an EventEmitter with stdout/stderr streams and a spy-able kill(). */
interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

/** Builds an EventEmitter-based stand-in for the tokei child process. */
function createFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

let originalConsoleError: typeof console.error;
let fakeChild: FakeChild;

beforeEach(() => {
  spawnMock.mockReset();
  fakeChild = createFakeChild();
  spawnMock.mockReturnValue(fakeChild);
  originalConsoleError = console.error;
  console.error = vi.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
  vi.useRealTimers();
});

describe("analyze - failure paths: spawn and parse errors", () => {
  it("reports a missing tokei binary as TOOL_NOT_AVAILABLE with install instructions", async () => {
    const promise = analyze("/some/path");
    fakeChild.emit("error", Object.assign(new Error("spawn tokei ENOENT"), { code: "ENOENT" }));

    const result = await promise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.error.code).toBe("TOOL_NOT_AVAILABLE");
      expect(result.error.error.message).toContain("brew install tokei");
    }
  });

  it("reports a non-ENOENT spawn error as PARSE_ERROR and logs it", async () => {
    const promise = analyze("/some/path");
    fakeChild.emit("error", Object.assign(new Error("boom"), { code: "EACCES" }));

    const result = await promise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.error.code).toBe("PARSE_ERROR");
    }
    expect(console.error).toHaveBeenCalled();
  });

  it("reports unparseable stdout as PARSE_ERROR", async () => {
    const promise = analyze("/some/path");
    fakeChild.stdout.emit("data", Buffer.from("not json"));
    fakeChild.emit("close", 0);

    const result = await promise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.error.code).toBe("PARSE_ERROR");
    }
  });

  it("treats a non-Error rejection as PARSE_ERROR rather than a missing binary", async () => {
    // Exercises the isExecError type guard's false arm: without the Error
    // instance check, reading .code off a non-Error would misclassify this.
    const promise = analyze("/some/path");
    fakeChild.emit("error", "something threw a string");

    const result = await promise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.error.code).toBe("PARSE_ERROR");
    }
  });
});

describe("analyze - failure paths: process outcome errors", () => {
  it("reports a non-zero exit as PARSE_ERROR", async () => {
    const promise = analyze("/some/path");
    fakeChild.stderr.emit("data", Buffer.from("tokei blew up"));
    fakeChild.emit("close", 1);

    const result = await promise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.error.code).toBe("PARSE_ERROR");
    }
  });

  it("reports oversized output with a structured error naming the cause and a fix", async () => {
    const promise = analyze("/some/path");
    // One chunk over the 512MB guard; its declared .length is enough to trip
    // the running byte counter without actually allocating that much memory.
    const oversized = { length: 512 * 1024 * 1024 + 1 } as Buffer;
    fakeChild.stdout.emit("data", oversized);
    fakeChild.emit("close", null);

    const result = await promise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.error.code).toBe("PARSE_ERROR");
      expect(result.error.error.message).toContain("512MB");
      expect(result.error.error.message).toMatch(/extensions|ignore_patterns/);
    }
    expect(fakeChild.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("reports a timeout with a structured error naming the cause and a fix", async () => {
    vi.useFakeTimers();
    const promise = analyze("/some/path");

    await vi.advanceTimersByTimeAsync(30_000);
    fakeChild.emit("close", null, "SIGKILL");

    const result = await promise;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.error.code).toBe("PARSE_ERROR");
      expect(result.error.error.message).toContain("30s");
      expect(result.error.error.message).toMatch(/extensions|ignore_patterns/);
    }
    expect(fakeChild.kill).toHaveBeenCalledWith("SIGKILL");
  });
});

describe("analyze - timeout handling", () => {
  it("kills the process with SIGKILL on timeout", async () => {
    vi.useFakeTimers();
    const promise = analyze("/some/path");

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fakeChild.kill).toHaveBeenCalledWith("SIGKILL");

    fakeChild.emit("close", null, "SIGKILL");
    await promise;
  });
});

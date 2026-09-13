import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { connect, createServer } = vi.hoisted(() => {
  const connect = vi.fn();
  return { connect, createServer: vi.fn(() => ({ connect })) };
});

vi.mock("./server.js", () => ({ createServer }));
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class {
    /** Stand-in for the real transport; index.ts only needs an instance to pass along. */
    readonly stub = true;
  },
}));

describe("index entrypoint", () => {
  beforeEach(() => {
    // The entrypoint runs on import, so each test needs a fresh module instance.
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("connects the server to a stdio transport on import", async () => {
    connect.mockResolvedValue(undefined);

    await import("./index.js");

    await vi.waitFor(() => {
      expect(connect).toHaveBeenCalledTimes(1);
    });
    expect(createServer).toHaveBeenCalledTimes(1);
    expect(connect.mock.calls[0]?.[0]).toBeInstanceOf(StdioServerTransport);
  });

  it("logs the error and exits with code 1 when startup fails", async () => {
    const error = new Error("transport unavailable");
    connect.mockRejectedValue(error);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      // Silence the expected startup error.
    });
    const exit = vi.spyOn(process, "exit").mockImplementation((() => {
      // Keep the test process alive.
    }) as never);

    await import("./index.js");

    await vi.waitFor(() => {
      expect(exit).toHaveBeenCalledWith(1);
    });
    expect(consoleError).toHaveBeenCalledWith("Server error:", error);
  });
});

import { spawn } from "node:child_process";
import { createError } from "../utils/errors.js";
import type { TokeiAnalysisResult, TokeiOutput } from "./tokei.js";

/**
 * Total stdout guard. Unlike the old execFile maxBuffer (50MB, a hard cap that
 * threw ERR_CHILD_PROCESS_STDIO_MAXBUFFER with no explanation), this is a
 * generous ceiling meant only to stop a runaway process on a huge tree; a
 * real scan should finish well under it.
 */
const MAX_OUTPUT_BYTES = 512 * 1024 * 1024;

/** Don't let a hung or oversized tokei process block the MCP request forever. */
const TIMEOUT_MS = 30_000;

const NARROW_SCAN_HINT = "Narrow the scan with extensions or ignore_patterns and try again.";

/** Why a tokei invocation finished the way it did; drives error mapping in {@link toAnalysisResult}. */
type TokeiCollectCause =
  "success" | "enoent" | "spawn-error" | "output-exceeded" | "timeout" | "exit-error";

interface TokeiCollectResult {
  stdout: Buffer;
  stderrText: string;
  cause: TokeiCollectCause;
  exitCode: number | null;
  spawnError?: unknown;
}

interface ExecError extends Error {
  code?: string | number;
}

/** Type guard for exec errors with optional code property. */
function isExecError(err: unknown): err is ExecError {
  return err instanceof Error;
}

/**
 * Spawns tokei and collects its stdout/stderr, classifying how the process
 * ended (clean exit, ENOENT, spawn error, output-size guard, or timeout).
 * Does not throw; all outcomes are reported via the returned cause so the
 * caller can map them to a structured {@link TokeiAnalysisResult}.
 */
export function collectTokeiOutput(args: string[]): Promise<TokeiCollectResult> {
  return new Promise<TokeiCollectResult>((resolve) => {
    let settled = false;
    let stdoutBytes = 0;
    let outputExceeded = false;
    let timedOut = false;
    let stderrText = "";
    const chunks: Buffer[] = [];

    const child = spawn("tokei", args, { killSignal: "SIGKILL" });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, TIMEOUT_MS);
    timer.unref();

    /**
     * Settles the promise with `result`, once. Node fires both "error" and
     * "close" on a failed spawn (e.g. ENOENT triggers "error" then "close"),
     * so only the first call may resolve.
     */
    const finish = (result: TokeiCollectResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.on("error", (err) => {
      if (isExecError(err) && err.code === "ENOENT") {
        finish({ stdout: Buffer.alloc(0), stderrText, cause: "enoent", exitCode: null });
        return;
      }
      finish({
        stdout: Buffer.alloc(0),
        stderrText,
        cause: "spawn-error",
        exitCode: null,
        spawnError: err,
      });
    });

    child.stdout.on("data", (chunk: Buffer) => {
      if (outputExceeded) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_OUTPUT_BYTES) {
        outputExceeded = true;
        child.kill("SIGKILL");
        return;
      }
      chunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrText += chunk.toString("utf-8");
    });

    child.on("close", (code) => {
      if (outputExceeded) {
        finish({ stdout: Buffer.alloc(0), stderrText, cause: "output-exceeded", exitCode: code });
        return;
      }

      if (timedOut) {
        finish({ stdout: Buffer.alloc(0), stderrText, cause: "timeout", exitCode: code });
        return;
      }

      if (code !== 0) {
        finish({ stdout: Buffer.alloc(0), stderrText, cause: "exit-error", exitCode: code });
        return;
      }

      finish({ stdout: Buffer.concat(chunks), stderrText, cause: "success", exitCode: code });
    });
  });
}

/** Maps a {@link TokeiCollectResult} to the public analyze() result, preserving prior error messages/logging. */
export function toAnalysisResult(result: TokeiCollectResult, path: string): TokeiAnalysisResult {
  switch (result.cause) {
    case "enoent":
      return {
        success: false,
        error: createError(
          "TOOL_NOT_AVAILABLE",
          "tokei is not installed. Install with: brew install tokei"
        ),
      };

    case "spawn-error":
      console.error("tokei error:", result.spawnError);
      return {
        success: false,
        error: createError("PARSE_ERROR", "Failed to analyze line counts", { path }),
      };

    case "output-exceeded": {
      const limitMb = String(MAX_OUTPUT_BYTES / (1024 * 1024));
      return {
        success: false,
        error: createError(
          "PARSE_ERROR",
          `tokei output exceeded the ${limitMb}MB size guard. ${NARROW_SCAN_HINT}`,
          { path }
        ),
      };
    }

    case "timeout":
      return {
        success: false,
        error: createError(
          "PARSE_ERROR",
          `tokei timed out after ${String(TIMEOUT_MS / 1000)}s. ${NARROW_SCAN_HINT}`,
          { path }
        ),
      };

    case "exit-error":
      console.error(
        "tokei error:",
        result.stderrText || `tokei exited with code ${String(result.exitCode)}`
      );
      return {
        success: false,
        error: createError("PARSE_ERROR", "Failed to analyze line counts", { path }),
      };

    case "success":
      try {
        const data = JSON.parse(result.stdout.toString("utf-8")) as TokeiOutput;
        return { success: true, data };
      } catch (err) {
        console.error("tokei error:", err);
        return {
          success: false,
          error: createError("PARSE_ERROR", "Failed to analyze line counts", { path }),
        };
      }
  }
}

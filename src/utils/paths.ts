import { realpathSync } from "node:fs";
import { stat, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, normalize, relative, isAbsolute, sep } from "node:path";
import type { ErrorResponse } from "../types/index.js";
import { createError } from "./errors.js";

export interface PathValidationSuccess {
  valid: true;
  resolvedPath: string;
  isDirectory: boolean;
}

export interface PathValidationFailure {
  valid: false;
  error: ErrorResponse;
}

export type PathValidationResult = PathValidationSuccess | PathValidationFailure;

/** Allowed roots default to the current working directory and system temp. */
function getAllowedRoots(): string[] {
  const fromEnv = process.env.SCOPEWALKER_ALLOWED_ROOTS;
  const normalizeRoot = (p: string): string => {
    try {
      return realpathSync(resolve(normalize(p)));
    } catch {
      return resolve(normalize(p));
    }
  };

  if (typeof fromEnv === "string" && fromEnv.trim() !== "") {
    return fromEnv
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p !== "")
      .map(normalizeRoot);
  }

  const roots = [process.cwd(), tmpdir()];
  return roots.map(normalizeRoot);
}

/** Returns true if the resolved path is within one of the allowed roots. */
function isWithinAllowedRoots(resolvedPath: string, allowedRoots: string[]): boolean {
  return allowedRoots.some((root) => {
    const rel = relative(root, resolvedPath);
    return rel === "" || (!rel.startsWith("..") && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  });
}

/**
 * Validates that a path exists and returns its resolved form.
 */
export async function validatePath(inputPath: string): Promise<PathValidationResult> {
  const allowedRoots = getAllowedRoots();
  const normalizedPath = resolve(normalize(inputPath));

  try {
    const resolvedPath = await realpath(normalizedPath);

    if (!isWithinAllowedRoots(resolvedPath, allowedRoots)) {
      return {
        valid: false,
        error: createError("PERMISSION_DENIED", `Path is outside allowed roots: ${inputPath}`, {
          path: inputPath,
          allowed_roots: allowedRoots,
        }),
      };
    }

    const stats = await stat(resolvedPath);
    return {
      valid: true,
      resolvedPath,
      isDirectory: stats.isDirectory(),
    };
  } catch (err) {
    if (err instanceof Error && "code" in err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === "ENOENT") {
        return {
          valid: false,
          error: createError("PATH_NOT_FOUND", `Path does not exist: ${inputPath}`, {
            path: inputPath,
          }),
        };
      }
      if (nodeErr.code === "EACCES") {
        return {
          valid: false,
          error: createError("PERMISSION_DENIED", `Cannot access: ${inputPath}`, {
            path: inputPath,
          }),
        };
      }
    }
    return {
      valid: false,
      error: createError("PARSE_ERROR", "Failed to validate path", {
        path: inputPath,
      }),
    };
  }
}

/**
 * Validates that a path exists and is a directory.
 */
export async function validateDirectory(inputPath: string): Promise<PathValidationResult> {
  const result = await validatePath(inputPath);
  if (!result.valid) {
    return result;
  }
  if (!result.isDirectory) {
    return {
      valid: false,
      error: createError("NOT_A_DIRECTORY", `Path is not a directory: ${inputPath}`, {
        path: inputPath,
      }),
    };
  }
  return result;
}

/**
 * Validates that a path exists and is a file.
 */
export async function validateFile(inputPath: string): Promise<PathValidationResult> {
  const result = await validatePath(inputPath);
  if (!result.valid) {
    return result;
  }
  if (result.isDirectory) {
    return {
      valid: false,
      error: createError("NOT_A_FILE", `Path is not a file: ${inputPath}`, {
        path: inputPath,
      }),
    };
  }
  return result;
}

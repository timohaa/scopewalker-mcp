import { stat } from "node:fs/promises";

/** Default maximum size for files we read into memory (1MB). */
export const DEFAULT_MAX_FILE_BYTES = 1 * 1024 * 1024;

/** Returns true when the file exists, is a regular file, and is below the size cap. */
export async function isFileWithinSizeLimit(
  fullPath: string,
  maxBytes: number = DEFAULT_MAX_FILE_BYTES
): Promise<boolean> {
  try {
    const fileStats = await stat(fullPath);
    return fileStats.isFile() && fileStats.size <= maxBytes;
  } catch {
    return false;
  }
}

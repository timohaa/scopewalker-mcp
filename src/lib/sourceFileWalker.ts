import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SupportedLanguage } from "../types/index.js";
import { isFileWithinSizeLimit } from "../utils/fileGuards.js";
import { detectLanguage } from "./treeSitter.js";

/** One readable source file, resolved and language-detected. */
export interface SourceFile {
  fullPath: string;
  /** Path as reported in tool output: relative when scanning a directory. */
  relativePath: string;
  language: SupportedLanguage;
  code: string;
}

/**
 * Yields every readable, supported, within-size-limit file from a scan list,
 * stopping after `maxFiles` of them.
 *
 * Six tools repeated this preamble verbatim before their own analysis. A
 * generator rather than a callback because the callers' accumulators have
 * nothing in common — arrays, running totals, and paired stats objects — and a
 * generic reduce would fit none of them.
 *
 * Files are skipped, not reported, when the language is unrecognised, the file
 * exceeds the size guard, or the read fails; a scan must survive an unreadable
 * file. The yield sits outside the try so that a throw from the *caller's*
 * analysis propagates instead of being mistaken for an unreadable file.
 *
 * `maxFiles` counts files yielded, not paths consumed, which is the whole point
 * of applying it here: a README at the top of the walk no longer spends the
 * caller's `max_files` budget on a file nothing can analyze. Being lazy, the
 * generator also stops reading once the caller has enough.
 */
export async function* walkSourceFiles(
  filePaths: string[],
  basePath: string,
  isDirectory: boolean,
  maxFiles?: number
): AsyncGenerator<SourceFile> {
  const capped = maxFiles !== undefined && maxFiles > 0;
  let yielded = 0;

  for (const filePath of filePaths) {
    if (capped && yielded >= maxFiles) return;

    const fullPath = isDirectory ? join(basePath, filePath) : filePath;
    const relativePath = isDirectory ? filePath : fullPath;
    const language = detectLanguage(fullPath);

    if (!language) continue;

    let code: string;
    try {
      const withinLimit = await isFileWithinSizeLimit(fullPath);
      if (!withinLimit) continue;
      code = await readFile(fullPath, "utf-8");
    } catch {
      continue;
    }

    yielded++;
    yield { fullPath, relativePath, language, code };
  }
}

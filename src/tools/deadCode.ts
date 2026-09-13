import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findFiles } from "../lib/glob.js";
import { walkSourceFiles } from "../lib/sourceFileWalker.js";
import { detectLanguage, parseCode } from "../lib/treeSitter.js";
import type { DeadCodeCandidate, DeadCodeResult } from "../types/index.js";
import { validatePath } from "../utils/paths.js";
import { createErrorResponse, createSuccessResponse } from "../utils/responses.js";
import {
  ignorePatternsSchema,
  extensionsSchema,
  maxDepthSchema,
  maxFilesSchema,
  limitSchema,
} from "../utils/schemaLimits.js";
import { collectCandidates } from "./deadCodeCandidates.js";
import { countOccurrences, resolveFindings } from "./deadCodeReferences.js";

const DEFAULT_LIMIT = 20;

const inputSchema = {
  path: z.string().describe("Target path"),
  include_hidden: z.boolean().optional().describe("Include hidden"),
  ignore_patterns: ignorePatternsSchema.describe("Exclude patterns"),
  extensions: extensionsSchema.describe("Filter by extensions"),
  max_depth: maxDepthSchema.describe("Max depth"),
  max_files: maxFilesSchema.describe("Max files to scan"),
  limit: limitSchema.describe("Max results per list"),
};

interface ScanResult {
  candidates: DeadCodeCandidate[];
  occurrences: Map<string, number>;
  filesScanned: number;
  filesSkipped: number;
}

/**
 * Counts the files a complete scan would have to parse.
 * Declaration files describe code that lives elsewhere, so they are neither
 * parsed nor missed.
 */
function countAnalyzable(filePaths: string[]): number {
  return filePaths.filter((p) => detectLanguage(p) !== null && !p.endsWith(".d.ts")).length;
}

/**
 * Reads every file once, collecting candidate declarations and name occurrences.
 *
 * Both halves come from the same pass because a reference in any file keeps a
 * declaration in any other file alive; the counts are only meaningful whole.
 */
async function scanFiles(
  filePaths: string[],
  basePath: string,
  isDirectory: boolean,
  maxFiles?: number
): Promise<ScanResult> {
  const candidates: DeadCodeCandidate[] = [];
  const occurrences = new Map<string, number>();
  let filesScanned = 0;

  for await (const { fullPath, relativePath, language, code } of walkSourceFiles(
    filePaths,
    basePath,
    isDirectory,
    maxFiles
  )) {
    if (fullPath.endsWith(".d.ts")) continue;

    try {
      const tree = await parseCode(code, language);
      if (!tree) continue;

      filesScanned++;
      countOccurrences(tree.rootNode, occurrences, language);
      candidates.push(...collectCandidates(tree.rootNode, language, relativePath, code));
    } catch {
      // One unparsable file must not abort the scan; it counts as skipped.
      continue;
    }
  }

  return {
    candidates,
    occurrences,
    filesScanned,
    filesSkipped: Math.max(countAnalyzable(filePaths) - filesScanned, 0),
  };
}

/** Tallies how many candidates each name declares, so self-declaration is not a reference. */
function countDeclarations(candidates: DeadCodeCandidate[]): Map<string, number> {
  const declarations = new Map<string, number>();
  for (const candidate of candidates) {
    declarations.set(candidate.key, (declarations.get(candidate.key) ?? 0) + 1);
  }
  return declarations;
}

/** Registers the find_dead_code tool for reporting symbols nothing in the scan references. */
export function registerDeadCodeTool(server: McpServer): void {
  server.registerTool(
    "find_dead_code",
    {
      description:
        "Finds declared symbols that nothing references. dead_code is proven unreachable within the scan; unreferenced_exports may be used outside it.",
      inputSchema,
    },
    async (args) => {
      const pathValidation = await validatePath(args.path);
      if (!pathValidation.valid) {
        return createErrorResponse(pathValidation.error);
      }

      const { resolvedPath, isDirectory } = pathValidation;

      const filePaths = isDirectory
        ? await findFiles({
            cwd: resolvedPath,
            includeHidden: args.include_hidden,
            ignorePatterns: args.ignore_patterns,
            extensions: args.extensions,
            maxDepth: args.max_depth,
          })
        : [resolvedPath];

      const scan = await scanFiles(filePaths, resolvedPath, isDirectory, args.max_files);
      const scanComplete = scan.filesSkipped === 0;

      // A Rust child module in a subdirectory may use its parent's private
      // items, so a depth-limited scan cannot prove a package-scoped symbol dead.
      const packageScanned = isDirectory && args.max_depth === undefined;

      const { deadCode, unreferencedExports } = resolveFindings(
        scan.candidates,
        scan.occurrences,
        countDeclarations(scan.candidates),
        packageScanned,
        scanComplete
      );

      const limit = args.limit ?? DEFAULT_LIMIT;
      const result: DeadCodeResult = {
        path: resolvedPath,
        is_directory: isDirectory,
        dead_code: deadCode.slice(0, limit),
        unreferenced_exports: unreferencedExports.slice(0, limit),
        // Counts describe the whole scan, not the truncated lists.
        summary: {
          files_scanned: scan.filesScanned,
          files_skipped: scan.filesSkipped,
          scan_complete: scanComplete,
          symbols_checked: scan.candidates.length,
          dead_code_found: deadCode.length,
          unreferenced_exports_found: unreferencedExports.length,
        },
      };

      return createSuccessResponse(result, {
        itemCount: result.dead_code.length + result.unreferenced_exports.length,
      });
    }
  );
}

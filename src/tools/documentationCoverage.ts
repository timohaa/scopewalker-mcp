import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findFiles } from "../lib/glob.js";
import { walkSourceFiles, type SourceScan } from "../lib/sourceFileWalker.js";
import { detectLanguage, parseCode } from "../lib/treeSitter.js";
import { validatePath } from "../utils/paths.js";
import {
  createErrorResponse,
  createSuccessResponse,
  READ_ONLY_ANNOTATIONS,
} from "../utils/responses.js";
import {
  boundedInt,
  extensionsSchema,
  ignorePatternsSchema,
  includeHiddenSchema,
  limitSchema,
  maxDepthSchema,
  maxFilesSchema,
  pathSchema,
  summaryOnlySchema,
} from "../utils/schemaLimits.js";
import {
  analyzeFileDocumentation,
  buildDocumentationCoverageResult,
  type DocSymbol,
} from "./documentationCoverageHelpers.js";
import { tallyCoverage, type CoverageTally } from "./documentationCoverageTally.js";

const DEFAULT_LIMIT = 20;

const inputSchema = {
  path: pathSchema,
  include_hidden: includeHiddenSchema,
  ignore_patterns: ignorePatternsSchema,
  extensions: extensionsSchema,
  max_depth: maxDepthSchema,
  max_files: maxFilesSchema,
  min_lines: boundedInt(10_000).describe(
    "Ignore functions shorter than this many lines (default 1)"
  ),
  summary_only: summaryOnlySchema,
  limit: limitSchema.describe("Max undocumented items returned (default 20)"),
};

/** Registers the get_documentation_coverage tool for finding undocumented code. */
export function registerDocumentationCoverageTool(server: McpServer): void {
  server.registerTool(
    "get_documentation_coverage",
    {
      title: "Documentation Coverage",
      description:
        "Finds undocumented functions/classes. Use limit/summary_only to control output.",
      inputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
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

      const analysis = await analyzeCoverage(
        { filePaths, basePath: resolvedPath, isDirectory, maxFiles: args.max_files },
        args.min_lines ?? 1
      );

      const result = buildDocumentationCoverageResult(
        {
          resolvedPath,
          summaryOnly: args.summary_only ?? false,
          limit: args.limit ?? DEFAULT_LIMIT,
        },
        { ...analysis, filesSkipped: countSkipped(filePaths, analysis.filesScanned) }
      );

      return createSuccessResponse(result, { itemCount: result.undocumented_items.length });
    }
  );
}

interface CoverageAnalysis extends CoverageTally {
  filesScanned: number;
}

/**
 * Counts the supported files a complete scan would have parsed but this one did not.
 * A file drops out when it exceeds the size guard, cannot be read, or fails to parse.
 */
function countSkipped(filePaths: string[], filesScanned: number): number {
  const analyzable = filePaths.filter((path) => detectLanguage(path) !== null).length;
  return Math.max(analyzable - filesScanned, 0);
}

/**
 * Parses every file, then counts documentation coverage across all of them.
 * Counting waits until the end because a C/C++ declaration in one file and its
 * definition in another are one symbol.
 */
async function analyzeCoverage(scan: SourceScan, minLines: number): Promise<CoverageAnalysis> {
  const symbols: DocSymbol[] = [];
  let filesScanned = 0;

  for await (const { relativePath, language, code } of walkSourceFiles(scan)) {
    try {
      const tree = await parseCode(code, language);
      if (!tree) continue;
      filesScanned++;

      const analysis = analyzeFileDocumentation({
        rootNode: tree.rootNode,
        lines: code.split("\n"),
        language,
        filePath: relativePath,
      });
      symbols.push(...analysis.symbols);
    } catch {
      // One unparsable file must not abort the scan.
      continue;
    }
  }

  return { ...tallyCoverage(symbols, minLines), filesScanned };
}

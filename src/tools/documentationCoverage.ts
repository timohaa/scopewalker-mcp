import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findFiles } from "../lib/glob.js";
import { detectLanguage, parseCode } from "../lib/treeSitter.js";
import type { FileDocumentation, UndocumentedItem } from "../types/index.js";
import { isFileWithinSizeLimit } from "../utils/fileGuards.js";
import { validatePath } from "../utils/paths.js";
import { createErrorResponse, createSuccessResponse } from "../utils/responses.js";
import {
  analyzeFileDocumentation,
  buildDocumentationCoverageResult,
} from "./documentationCoverageHelpers.js";

const DEFAULT_LIMIT = 20;

const inputSchema = {
  path: z.string().describe("Target path"),
  include_hidden: z.boolean().optional().describe("Include hidden"),
  ignore_patterns: z.array(z.string()).optional().describe("Exclude patterns"),
  extensions: z.array(z.string()).optional().describe("Filter by extensions"),
  max_depth: z.number().int().positive().optional().describe("Max depth"),
  max_files: z.number().int().positive().optional().describe("Max files to scan"),
  require_param_docs: z.boolean().optional().describe("Require param docs"),
  require_return_docs: z.boolean().optional().describe("Require return docs"),
  min_lines: z.number().int().positive().optional().describe("Min function lines"),
  summary_only: z.boolean().optional().describe("Summary only"),
  limit: z.number().int().positive().optional().describe("Max results"),
};

/** Registers the get_documentation_coverage tool for finding undocumented code. */
export function registerDocumentationCoverageTool(server: McpServer): void {
  server.registerTool(
    "get_documentation_coverage",
    {
      description:
        "Finds undocumented functions/classes. Use limit/summary_only to control output.",
      inputSchema,
    },
    async (args) => {
      const pathValidation = await validatePath(args.path);
      if (!pathValidation.valid) {
        return createErrorResponse(pathValidation.error);
      }

      const { resolvedPath, isDirectory } = pathValidation;

      let filePaths = isDirectory
        ? await findFiles({
            cwd: resolvedPath,
            includeHidden: args.include_hidden,
            ignorePatterns: args.ignore_patterns,
            extensions: args.extensions,
            maxDepth: args.max_depth,
          })
        : [resolvedPath];

      if (args.max_files !== undefined && args.max_files > 0 && filePaths.length > args.max_files) {
        filePaths = filePaths.slice(0, args.max_files);
      }

      const { byFile, undocumentedItems, totalDocumented, totalUndocumented } =
        await analyzeCoverage(filePaths, resolvedPath, isDirectory, args.min_lines ?? 1);

      const result = buildDocumentationCoverageResult(
        {
          resolvedPath,
          summaryOnly: args.summary_only ?? false,
          limit: args.limit ?? DEFAULT_LIMIT,
        },
        { byFile, undocumentedItems, totalDocumented, totalUndocumented }
      );

      return createSuccessResponse(result, { itemCount: result.undocumented_items.length });
    }
  );
}

interface CoverageAnalysis {
  byFile: FileDocumentation[];
  undocumentedItems: UndocumentedItem[];
  totalDocumented: number;
  totalUndocumented: number;
}

/** Parses files and analyzes documentation coverage for each. */
async function analyzeCoverage(
  filePaths: string[],
  basePath: string,
  isDirectory: boolean,
  minLines: number
): Promise<CoverageAnalysis> {
  const byFile: FileDocumentation[] = [];
  const undocumentedItems: UndocumentedItem[] = [];
  let totalDocumented = 0;
  let totalUndocumented = 0;

  for (const filePath of filePaths) {
    const fullPath = isDirectory ? join(basePath, filePath) : filePath;
    const relativePath = isDirectory ? filePath : fullPath;
    const language = detectLanguage(fullPath);

    if (!language) continue;

    try {
      const withinLimit = await isFileWithinSizeLimit(fullPath);
      if (!withinLimit) continue;

      const code = await readFile(fullPath, "utf-8");
      const lines = code.split("\n");
      const tree = await parseCode(code, language);
      if (!tree) continue;

      const { documented, undocumented, items } = analyzeFileDocumentation({
        rootNode: tree.rootNode,
        lines,
        language,
        filePath: relativePath,
        minLines,
      });

      totalDocumented += documented;
      totalUndocumented += undocumented;

      if (documented + undocumented > 0) {
        const percentage = Math.round((documented / (documented + undocumented)) * 1000) / 10;
        byFile.push({ path: relativePath, documented, undocumented, percentage });
      }

      undocumentedItems.push(...items);
    } catch {
      // Skip files that can't be read
    }
  }

  return { byFile, undocumentedItems, totalDocumented, totalUndocumented };
}

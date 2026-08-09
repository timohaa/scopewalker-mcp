import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findFiles } from "../lib/glob.js";
import { walkSourceFiles } from "../lib/sourceFileWalker.js";
import type { FileSmells } from "../types/index.js";
import { validatePath } from "../utils/paths.js";
import { createErrorResponse, createSuccessResponse } from "../utils/responses.js";
import {
  ALL_SMELL_TYPES,
  createEmptySmellCounts,
  updateSmellCounts,
  processFileForSmells,
  buildCodeSmellsResult,
} from "./codeSmellsHelpers.js";

const DEFAULT_LIMIT = 20;

const inputSchema = {
  path: z.string().describe("Target path"),
  include_hidden: z.boolean().optional().describe("Include hidden"),
  ignore_patterns: z.array(z.string()).optional().describe("Exclude patterns"),
  extensions: z.array(z.string()).optional().describe("Filter by extensions"),
  max_depth: z.number().int().positive().optional().describe("Max depth"),
  max_files: z.number().int().positive().optional().describe("Max files to scan"),
  types: z
    .array(z.enum(["todo", "fixme", "hack", "xxx", "bug", "unused", "deprecated", "unsafe_cast"]))
    .optional()
    .describe("Smell types to detect"),
  limit: z.number().int().positive().optional().describe("Max results"),
  include_text: z.boolean().optional().describe("Include comment text"),
};

/** Registers the get_code_smells tool for finding TODO, FIXME, HACK, etc. */
export function registerCodeSmellsTool(server: McpServer): void {
  server.registerTool(
    "get_code_smells",
    {
      description: "Finds TODO/FIXME/HACK/BUG markers and unsafe casts in code.",
      inputSchema,
    },
    async (args) => {
      const pathValidation = await validatePath(args.path);
      if (!pathValidation.valid) {
        return createErrorResponse(pathValidation.error);
      }

      const { resolvedPath, isDirectory } = pathValidation;
      const typesToDetect = args.types ?? ALL_SMELL_TYPES;

      const filePaths = isDirectory
        ? await findFiles({
            cwd: resolvedPath,
            includeHidden: args.include_hidden,
            ignorePatterns: args.ignore_patterns,
            extensions: args.extensions,
            maxDepth: args.max_depth,
          })
        : [resolvedPath];

      const files: FileSmells[] = [];
      const byType = createEmptySmellCounts();
      let totalFilesScanned = 0;

      for await (const file of walkSourceFiles(
        filePaths,
        resolvedPath,
        isDirectory,
        args.max_files
      )) {
        totalFilesScanned++;
        const fileSmells = await processFileForSmells(
          file,
          typesToDetect,
          args.include_text === true
        );

        if (fileSmells) {
          files.push(fileSmells);
          updateSmellCounts(byType, fileSmells.smells);
        }
      }

      const result = buildCodeSmellsResult({
        resolvedPath,
        isDirectory,
        files,
        byType,
        totalFilesScanned,
        limit: args.limit ?? DEFAULT_LIMIT,
      });

      return createSuccessResponse(result, { itemCount: result.files.length });
    }
  );
}

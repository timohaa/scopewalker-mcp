import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findFiles } from "../lib/glob.js";
import { walkSourceFiles } from "../lib/sourceFileWalker.js";
import { codeSmellsResultSchema, type FileSmells } from "../types/index.js";
import { validatePath } from "../utils/paths.js";
import {
  createErrorResponse,
  createSuccessResponse,
  READ_ONLY_ANNOTATIONS,
  withResponseMeta,
} from "../utils/responses.js";
import {
  extensionsSchema,
  ignorePatternsSchema,
  includeHiddenSchema,
  limitSchema,
  maxDepthSchema,
  maxFilesSchema,
  pathSchema,
} from "../utils/schemaLimits.js";
import {
  ALL_SMELL_TYPES,
  createEmptySmellCounts,
  updateSmellCounts,
  processFileForSmells,
  buildCodeSmellsResult,
} from "./codeSmellsHelpers.js";

const DEFAULT_LIMIT = 20;

const inputSchema = {
  path: pathSchema,
  include_hidden: includeHiddenSchema,
  ignore_patterns: ignorePatternsSchema,
  extensions: extensionsSchema,
  max_depth: maxDepthSchema,
  max_files: maxFilesSchema,
  types: z
    .array(z.enum(["todo", "fixme", "hack", "xxx", "bug", "unused", "deprecated", "unsafe_cast"]))
    .optional()
    .describe("Smell types to detect (default all)"),
  limit: limitSchema.describe("Max files returned (default 20)"),
  include_text: z
    .boolean()
    .optional()
    .describe("Include each marker's comment text (default false)"),
};

/** Registers the get_code_smells tool for finding TODO, FIXME, HACK, etc. */
export function registerCodeSmellsTool(server: McpServer): void {
  server.registerTool(
    "get_code_smells",
    {
      title: "Code Smells",
      description: "Finds TODO/FIXME/HACK/BUG markers and unsafe casts in code.",
      inputSchema,
      outputSchema: withResponseMeta(codeSmellsResultSchema),
      annotations: READ_ONLY_ANNOTATIONS,
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

      for await (const file of walkSourceFiles({
        filePaths,
        basePath: resolvedPath,
        isDirectory,
        maxFiles: args.max_files,
      })) {
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

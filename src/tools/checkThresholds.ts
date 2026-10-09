import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findFiles, DEFAULT_IGNORE_PATTERNS } from "../lib/glob.js";
import { analyze } from "../lib/tokei.js";
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
} from "../utils/schemaLimits.js";
import {
  findOversizedFiles,
  findOversizedFunctions,
  sortAndLimitViolations,
  buildCheckThresholdsResult,
} from "./checkThresholdsHelpers.js";

const inputSchema = {
  path: pathSchema,
  max_file_lines: boundedInt(10_000).describe(
    "Flag files longer than this many lines (default 300)"
  ),
  max_function_lines: boundedInt(10_000).describe(
    "Flag functions longer than this many lines (default 100)"
  ),
  include_hidden: includeHiddenSchema,
  ignore_patterns: ignorePatternsSchema,
  extensions: extensionsSchema,
  max_depth: maxDepthSchema,
  max_files: maxFilesSchema,
  limit: limitSchema.describe("Max violations returned per list (default 20)"),
};

const DEFAULT_MAX_FILE_LINES = 300;
const DEFAULT_MAX_FUNCTION_LINES = 100;
const DEFAULT_LIMIT = 20;

/** Registers the check_thresholds tool for finding oversized files and functions. */
export function registerCheckThresholdsTool(server: McpServer): void {
  server.registerTool(
    "check_thresholds",
    {
      title: "Size Thresholds",
      description: "Finds files/functions exceeding size thresholds. Use limit to control output.",
      inputSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => {
      const pathValidation = await validatePath(args.path);
      if (!pathValidation.valid) {
        return createErrorResponse(pathValidation.error);
      }

      const { resolvedPath, isDirectory } = pathValidation;
      const maxFileLines = args.max_file_lines ?? DEFAULT_MAX_FILE_LINES;
      const maxFunctionLines = args.max_function_lines ?? DEFAULT_MAX_FUNCTION_LINES;

      const extensions = args.extensions?.map((e) => (e.startsWith(".") ? e.slice(1) : e));
      const tokeiResult = await analyze(resolvedPath, {
        extensions,
        exclude: [...DEFAULT_IGNORE_PATTERNS, ...(args.ignore_patterns ?? [])],
        includeHidden: args.include_hidden,
      });

      if (!tokeiResult.success) {
        return createErrorResponse(tokeiResult.error);
      }

      const { oversizedFiles, fileLineCounts } = findOversizedFiles(
        tokeiResult.data,
        resolvedPath,
        maxFileLines
      );

      const filePaths = isDirectory
        ? await findFiles({
            cwd: resolvedPath,
            includeHidden: args.include_hidden,
            ignorePatterns: args.ignore_patterns,
            extensions: args.extensions,
            maxDepth: args.max_depth,
          })
        : [resolvedPath];

      const { oversizedFunctions, totalFunctions, filesSkipped } = await findOversizedFunctions(
        { filePaths, basePath: resolvedPath, isDirectory, maxFiles: args.max_files },
        maxFunctionLines
      );

      const limit = args.limit ?? DEFAULT_LIMIT;
      const limitedFiles = sortAndLimitViolations(oversizedFiles, limit);
      const limitedFunctions = sortAndLimitViolations(oversizedFunctions, limit);

      const result = buildCheckThresholdsResult(
        { resolvedPath, maxFileLines, maxFunctionLines },
        {
          oversizedFiles: limitedFiles,
          oversizedFunctions: limitedFunctions,
          totalFileViolations: oversizedFiles.length,
          totalFunctionViolations: oversizedFunctions.length,
        },
        {
          filesChecked: fileLineCounts.size,
          totalFunctions,
          filesSkipped,
          scanComplete: filesSkipped === 0,
        }
      );

      const itemCount = limitedFiles.length + limitedFunctions.length;
      return createSuccessResponse(result, { itemCount });
    }
  );
}

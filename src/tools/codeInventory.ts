import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findFiles } from "../lib/glob.js";
import { walkSourceFiles, type SourceScan } from "../lib/sourceFileWalker.js";
import { parseCode } from "../lib/treeSitter.js";
import {
  type CodeInventoryResult,
  codeInventoryResultSchema,
  type FileInventory,
  type InventoryItem,
} from "../types/index.js";
import type { ToolContext } from "../utils/clientRoots.js";
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
import { dropOutOfLineMembers } from "./codeInventoryCpp.js";
import { collectExportedNames, markExported } from "./codeInventoryExports.js";
import {
  attachGoMethods,
  collectGoMethods,
  type PendingGoMethod,
} from "./codeInventoryGoMethods.js";
import { walkNode, extractItem, calculateSummary } from "./codeInventoryHelpers.js";

const DEFAULT_LIMIT = 20;

/** Maximum number of items to include per file to prevent huge responses. */
const MAX_ITEMS_PER_FILE = 100;

const inputSchema = {
  path: pathSchema,
  include_hidden: includeHiddenSchema,
  ignore_patterns: ignorePatternsSchema,
  extensions: extensionsSchema,
  max_depth: maxDepthSchema,
  max_files: maxFilesSchema,
  include_private: z
    .boolean()
    .optional()
    .describe("Include private and unexported symbols (default false)"),
  limit: limitSchema.describe("Max files returned (default 20)"),
  grep: z
    .string()
    .optional()
    .describe("Keep files or symbols whose path or name contains this text (case-insensitive)"),
};

/** Registers the get_code_inventory tool for listing classes, functions, and exports. */
export function registerCodeInventoryTool(server: McpServer, context: ToolContext): void {
  server.registerTool(
    "get_code_inventory",
    {
      title: "Code Inventory",
      description: "Lists classes, functions, methods, and exports. Use extensions to filter.",
      inputSchema,
      outputSchema: withResponseMeta(codeInventoryResultSchema),
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async (args) => {
      const pathValidation = await validatePath(args.path, await context.getClientRoots());
      if (!pathValidation.valid) {
        return createErrorResponse(pathValidation.error);
      }

      const { resolvedPath, isDirectory } = pathValidation;

      let filePaths: string[];
      if (isDirectory) {
        filePaths = await findFiles({
          cwd: resolvedPath,
          includeHidden: args.include_hidden,
          ignorePatterns: args.ignore_patterns,
          extensions: args.extensions,
          maxDepth: args.max_depth,
        });
      } else {
        filePaths = [resolvedPath];
      }

      let inventory = await analyzeInventory(
        { filePaths, basePath: resolvedPath, isDirectory, maxFiles: args.max_files },
        args.include_private ?? false
      );

      if (args.grep !== undefined && args.grep !== "") {
        const pattern = args.grep.toLowerCase();
        inventory = inventory
          .map((file) => {
            if (file.file.toLowerCase().includes(pattern)) {
              return file;
            }
            return {
              ...file,
              items: file.items.filter((item) => item.name.toLowerCase().includes(pattern)),
            };
          })
          .filter((file) => file.file.toLowerCase().includes(pattern) || file.items.length > 0);
      }

      const limit = args.limit ?? DEFAULT_LIMIT;
      const limitedInventory = inventory.slice(0, limit);

      const cappedInventory = limitedInventory.map((file) => ({
        ...file,
        items: file.items.slice(0, MAX_ITEMS_PER_FILE),
      }));

      const summary = calculateSummary(inventory); // Summary uses full list for accurate totals
      const result: CodeInventoryResult = {
        path: resolvedPath,
        inventory: cappedInventory,
        summary,
      };

      const totalItems = cappedInventory.reduce((sum, file) => sum + file.items.length, 0);
      return createSuccessResponse(result, { itemCount: totalItems });
    }
  );
}

/** Parses files and collects inventory items (classes, functions, etc.). */
async function analyzeInventory(
  scan: SourceScan,
  includePrivate: boolean
): Promise<FileInventory[]> {
  const results: FileInventory[] = [];
  // Go receivers can only be matched once every file in the package has been read.
  const pendingGoMethods: PendingGoMethod[] = [];

  for await (const { relativePath, language, code } of walkSourceFiles(scan)) {
    try {
      const tree = await parseCode(code, language);
      if (!tree) continue;

      const items = extractInventoryItems(tree.rootNode, language, includePrivate);

      if (language === "go") {
        pendingGoMethods.push(...collectGoMethods(tree.rootNode, relativePath, includePrivate));
      }

      if (items.length > 0) {
        results.push({
          file: relativePath,
          items,
        });
      }
    } catch {
      // One unparsable file must not abort the scan.
      continue;
    }
  }

  attachGoMethods(pendingGoMethods, results);

  return results;
}

/** Walks AST and extracts inventory items from each node. */
function extractInventoryItems(
  rootNode: Parameters<typeof walkNode>[0],
  language: Parameters<typeof extractItem>[1],
  includePrivate: boolean
): InventoryItem[] {
  const items: InventoryItem[] = [];

  walkNode(rootNode, (node) => {
    const item = extractItem(node, language, includePrivate);
    if (item) {
      items.push(item);
    }
  });

  return finalizeItems(items, rootNode, language);
}

/** Applies the passes that can only run once every item of a file is known. */
function finalizeItems(
  items: InventoryItem[],
  rootNode: Parameters<typeof walkNode>[0],
  language: Parameters<typeof extractItem>[1]
): InventoryItem[] {
  if (language === "c" || language === "cpp") {
    return dropOutOfLineMembers(items);
  }

  const exported = collectExportedNames(rootNode, language);
  return exported.size === 0 ? items : markExported(items, exported);
}

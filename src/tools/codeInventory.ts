import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findFiles } from "../lib/glob.js";
import { walkSourceFiles } from "../lib/sourceFileWalker.js";
import { parseCode } from "../lib/treeSitter.js";
import type { CodeInventoryResult, FileInventory, InventoryItem } from "../types/index.js";
import { validatePath } from "../utils/paths.js";
import { createErrorResponse, createSuccessResponse } from "../utils/responses.js";
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
  path: z.string().describe("Target path"),
  include_hidden: z.boolean().optional().describe("Include hidden"),
  ignore_patterns: z.array(z.string()).optional().describe("Exclude patterns"),
  extensions: z.array(z.string()).optional().describe("Filter by extensions"),
  max_depth: z.number().int().positive().optional().describe("Max depth"),
  max_files: z.number().int().positive().optional().describe("Max files to scan"),
  include_private: z.boolean().optional().describe("Include private symbols"),
  limit: z.number().int().positive().optional().describe("Max results"),
  grep: z.string().optional().describe("Filter by keyword"),
};

/** Registers the get_code_inventory tool for listing classes, functions, and exports. */
export function registerCodeInventoryTool(server: McpServer): void {
  server.registerTool(
    "get_code_inventory",
    {
      description: "Lists classes, functions, methods, and exports. Use extensions to filter.",
      inputSchema,
    },
    async (args) => {
      const pathValidation = await validatePath(args.path);
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
        filePaths,
        resolvedPath,
        isDirectory,
        args.include_private ?? false,
        args.max_files
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

      // Cap items per file to prevent huge responses
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
  filePaths: string[],
  basePath: string,
  isDirectory: boolean,
  includePrivate: boolean,
  maxFiles?: number
): Promise<FileInventory[]> {
  const results: FileInventory[] = [];
  // Go receivers can only be matched once every file in the package has been read.
  const pendingGoMethods: PendingGoMethod[] = [];

  for await (const { relativePath, language, code } of walkSourceFiles(
    filePaths,
    basePath,
    isDirectory,
    maxFiles
  )) {
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

  return items;
}

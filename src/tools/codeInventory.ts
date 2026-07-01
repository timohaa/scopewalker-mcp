import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findFiles } from "../lib/glob.js";
import { detectLanguage, parseCode } from "../lib/treeSitter.js";
import type { CodeInventoryResult, FileInventory, InventoryItem } from "../types/index.js";
import { isFileWithinSizeLimit } from "../utils/fileGuards.js";
import { validatePath } from "../utils/paths.js";
import { createErrorResponse, createSuccessResponse } from "../utils/responses.js";
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
  group_by: z.enum(["file", "type", "directory"]).optional().describe("Grouping method"),
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

      if (args.max_files !== undefined && args.max_files > 0 && filePaths.length > args.max_files) {
        filePaths = filePaths.slice(0, args.max_files);
      }

      let inventory = await analyzeInventory(
        filePaths,
        resolvedPath,
        isDirectory,
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
  includePrivate: boolean
): Promise<FileInventory[]> {
  const results: FileInventory[] = [];

  for (const filePath of filePaths) {
    const fullPath = isDirectory ? join(basePath, filePath) : filePath;
    const relativePath = isDirectory ? filePath : fullPath;
    const language = detectLanguage(fullPath);

    if (!language) continue;

    try {
      const withinLimit = await isFileWithinSizeLimit(fullPath);
      if (!withinLimit) continue;

      const code = await readFile(fullPath, "utf-8");
      const tree = await parseCode(code, language);
      if (!tree) continue;

      const items = extractInventoryItems(tree.rootNode, language, includePrivate);

      if (items.length > 0) {
        results.push({
          file: relativePath,
          items,
        });
      }
    } catch {
      // Skip files that can't be read
    }
  }

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

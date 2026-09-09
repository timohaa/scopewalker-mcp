# Code Patterns

## Module Layout

Each tool lives in `src/tools/[toolName].ts`. That file holds the zod `inputSchema`, registration, and handler. Move analysis logic into sibling helper modules before the tool reaches 300 lines. Use `[toolName]Helpers.ts`, then concern-named files such as `codeInventoryVisibility.ts`. Tests sit beside the code as `[toolName].test.ts`. Split focused suites by concern, as in `complexityMetrics.jsx.test.ts`.

## MCP Tool Registration

```typescript
server.registerTool(
  "tool_name",
  {
    description: "Tool description",
    inputSchema: { path: z.string().describe("Path description") },
  },
  async (args) => {
    const pathValidation = await validatePath(args.path);
    if (!pathValidation.valid) {
      return createErrorResponse(pathValidation.error);
    }
    // Implementation
    return createSuccessResponse(result, { itemCount: items.length });
  }
);
```

AST-based file-scanning tools generally use this handler shape after `validatePath`:

1. Directory input → `findFiles({ cwd, includeHidden, ignorePatterns, extensions, maxDepth })`; file input → single-element list.
2. Iterate that list with `walkSourceFiles(filePaths, basePath, isDirectory, args.max_files)` from `src/lib/sourceFileWalker.ts`. It yields `{ fullPath, relativePath, language, code }`. It handles language detection, the `isFileWithinSizeLimit` guard (`DEFAULT_MAX_FILE_BYTES`, 1 MB), and the read, skipping silently on each. Files that fail to parse are the caller's to skip.
3. Pass `args.max_files` to the walker rather than slicing the path list first. The walker counts files it yields. Unsupported and oversized files therefore do not spend the budget. Slicing first caused `max_files: 1` to analyze nothing when a README led the directory.
4. Sort results and slice to `args.limit ?? DEFAULT_LIMIT` (20). Tools that accept `summary_only` return an empty details array when it is true.

New tools should copy this shape from an existing tool (e.g. `src/tools/complexityMetrics.ts`) rather than invent a variant.

Derive per-file counters from what the walker yields, not from `filePaths.length` — the two differ whenever the scan list holds anything unanalyzable.

## Tree-sitter Layer

Every AST-based tool reaches the syntax tree the same way:

```typescript
const language = detectLanguage(fullPath); // extension → SupportedLanguage | null
if (language === null) continue; // unsupported file: skip silently
const tree = await parseCode(code, language); // null if the grammar fails to load
if (tree === null) continue;
walkNode(tree.rootNode, (node) => {
  /* match on node.type */
});
```

- `detectLanguage` and `parseCode` live in `src/lib/treeSitter.ts`. `detectLanguage` returns `null` for unsupported extensions. `parseCode` returns `null` when a grammar cannot load; other parser failures can throw. File-scanning callers catch those failures and skip the file.
- `walkNode` (`src/lib/astWalker.ts`) provides the shared pre-order traversal. It calls the callback on nodes through depth 500; deeper nodes are skipped. `codeInventoryHelpers.ts` and `complexityMetricsHelpers.ts` re-export it for their own tool modules. New tools should import it from `../lib/astWalker.js` directly.
- Grammars are lazily imported and cached per language in `src/lib/treeSitterGrammars.ts`. Adding a language means a loader there, an entry in `EXTENSION_MAP` (`treeSitter.ts`), and a member on `SupportedLanguage` (`src/types/languages.ts`).
- Node type names differ per grammar, so `node.type` matches need per-language lists. Copy the shape of `getFunctionNodeTypes` in `treeSitter.ts`. Grammar-name mismatches are the single most common source of entries in [known-bugs.md](./known-bugs.md). Check the node names against each grammar rather than assuming they carry over.
- `getFunctions` (function locations), `getComments`, and `countImports` already wrap the walk for the three cross-cutting queries. Prefer them over a fresh traversal.

## Server Registration

`createServer` in `src/server.ts` registers every tool and calls `applySchemaStrippingOverride`. The override removes `$schema` from each emitted JSON Schema. Zod v4 emits it, and some API providers silently reject tool definitions that include it. It replaces the SDK's `tools/list` handler and reads the private `_registeredTools` field. An upstream field rename would therefore break tool listing. `src/server.test.ts` checks the advertised names, absent `$schema`, and preserved descriptions. The override automatically covers each new `register*` call.

## Error Handling

- Structured errors built with `createError(code, message, details)`, shaped `{ error: { code, message, path?, ...details } }`
- Codes: `PATH_NOT_FOUND`, `PARSE_ERROR`, `UNSUPPORTED_LANGUAGE`, `TOOL_NOT_AVAILABLE`, and more; see the full table in [tools-overview.md](./tools-overview.md#error-codes)
- Set `isError: true` for error responses

## Testing

```typescript
const handler = getToolHandler(registerMyTool, "tool_name");
const response = await handler({ path: testDir });
const result = parseContent<ResultType>(response);
```

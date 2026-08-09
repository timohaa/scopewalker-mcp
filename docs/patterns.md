# Code Patterns

## Module Layout

Each tool lives in `src/tools/[toolName].ts`, which holds the zod `inputSchema` and the registration/handler. Analysis logic that would push the file past the 300-line limit is split into sibling helper modules (`[toolName]Helpers.ts`, plus further concern-named files like `codeInventoryVisibility.ts` when helpers grow). Tests sit next to the code as `[toolName].test.ts`, with focused suites split by concern (`complexityMetrics.jsx.test.ts`).

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

Every file-scanning tool repeats the same handler shape after `validatePath`:

1. Directory input → `findFiles({ cwd, includeHidden, ignorePatterns, extensions, maxDepth })`; file input → single-element list.
2. Iterate that list with `walkSourceFiles(filePaths, basePath, isDirectory, args.max_files)` from `src/lib/sourceFileWalker.ts`, which yields `{ fullPath, relativePath, language, code }`. It handles language detection, the `isFileWithinSizeLimit` guard (`DEFAULT_MAX_FILE_BYTES`, 1 MB), and the read — skipping silently on each. Files that fail to parse are the caller's to skip.
3. Pass `args.max_files` to the walker rather than slicing the path list up front. The walker counts files it *yields*, so unsupported and oversized files no longer spend the budget; slicing beforehand meant `max_files: 1` on a directory led by a README analyzed nothing.
4. Sort results, slice to `args.limit ?? DEFAULT_LIMIT` (20), and honor `summary_only` by returning an empty details array.

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

- `detectLanguage` and `parseCode` live in `src/lib/treeSitter.ts`. Both return `null` instead of throwing, which is what lets step 3 of the handler shape above skip bad files without a branch per failure mode.
- `walkNode` (`src/lib/astWalker.ts`) is the single shared traversal: pre-order, callback on every node. `codeInventoryHelpers.ts` and `complexityMetricsHelpers.ts` re-export it for their own tool modules; new tools should import it from `../lib/astWalker.js` directly.
- Grammars are lazily imported and cached per language in `src/lib/treeSitterGrammars.ts`. Adding a language means a loader there, an entry in `EXTENSION_MAP` (`treeSitter.ts`), and a member on `SupportedLanguage` (`src/types/languages.ts`).
- Node type names differ per grammar, so anything matching `node.type` needs a per-language list — copy the shape of `getFunctionNodeTypes` in `treeSitter.ts`. Grammar-name mismatches are the single most common source of entries in [known-bugs.md](./known-bugs.md); check the node names against each grammar rather than assuming they carry over.
- `getFunctions` (function locations), `getComments`, and `countImports` already wrap the walk for the three cross-cutting queries. Prefer them over a fresh traversal.

## Server Registration

`createServer` in `src/server.ts` registers every tool, then calls `applySchemaStrippingOverride`, which replaces the SDK's `tools/list` handler so it can delete `$schema` from each emitted JSON Schema — Zod v4 emits it and some API providers silently reject tool definitions that include it. The override reads the SDK's private `_registeredTools`, so an upstream rename would produce an empty tool list rather than an error; `src/server.test.ts` asserts the advertised names, the absent `$schema`, and preserved descriptions to make that fail loudly. A new tool needs nothing beyond its `register*` call — the override covers it automatically.

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

---
name: create-tool
description: Scaffold a new MCP tool with types, implementation, tests, and registration. Use when adding a new analysis tool to the server.
---

# Create Tool

Scaffold all files for a new MCP tool following project conventions.

## Workflow

### 1. Gather requirements

Infer these from the request and repository; ask only for missing requirements:

- Tool name (snake_case, e.g., `get_dependency_graph`)
- Description (one sentence, used in MCP tool listing)
- Input parameters (name, type, required/optional, description)
- Output shape (what the result looks like)

### 2. Reference existing patterns

Read `docs/patterns.md` for tool registration, error handling, and testing patterns. Also read an existing tool in `src/tools/` as a concrete example.

### 3. Create files

1. **Types**: `src/types/[concern].ts` (named by domain, e.g. `complexity.ts`, `thresholds.ts`), export from `src/types/index.ts`
2. **Implementation**: `src/tools/[toolName].ts` following the registration pattern
3. **Tests**: `src/tools/[toolName].test.ts` using `getToolHandler`/`parseContent` from `src/testUtils/toolTestHarness.ts`
4. **Registration**: add the import and `register*Tool(server)` call in `createServer()` in `src/server.ts`, and add the tool name to `EXPECTED_TOOLS` in `src/server.test.ts`

### 4. Update documentation

- Add the tool to the quick reference table in `TOOLS.md`
- Add detailed docs to the appropriate `docs/tools-*.md` file
- Add the tool to the list in `README.md`, and update the tool count there and in `docs/tools-overview.md`

### 5. Verify

```bash
npm run check       # check:versions + lint:fix + typecheck
npm run test        # all tests pass
```

Run all source-change checks in [docs/code-quality.md](../../../docs/code-quality.md),
including changed registration, implementation, and test files. Fix actionable findings
and rerun the detecting tools before declaring the tool complete.
Exercise the new tool through its MCP handler tests and verify the documented response shape.

---
name: create-tool
description: Scaffold a new MCP tool with types, implementation, tests, and registration
---

# Create Tool

Scaffold all files for a new MCP tool following project conventions.

## Workflow

### 1. Gather requirements

Ask the user:

- Tool name (snake_case, e.g., `get_dependency_graph`)
- Description (one sentence, used in MCP tool listing)
- Input parameters (name, type, required/optional, description)
- Output shape (what the result looks like)

### 2. Reference existing patterns

Read `docs/patterns.md` for tool registration, error handling, and testing patterns. Also read an existing tool in `src/tools/` as a concrete example.

### 3. Create files

1. **Types** — `src/types/[toolName].ts`, export from `src/types/index.ts`
2. **Implementation** — `src/tools/[toolName].ts` following the registration pattern
3. **Tests** — `src/tools/[toolName].test.ts` using `getToolHandler`/`parseContent` from `src/testUtils/toolTestHarness.ts`
4. **Registration** — add import and call in `src/index.ts`

### 4. Update documentation

- Add tool to `TOOLS.md`
- Add detailed docs to the appropriate `docs/tools-*.md` file

### 5. Verify

```bash
npm run check       # lint + typecheck
npm run test        # all tests pass
```

Use `check_thresholds` to verify the new files are within size limits.

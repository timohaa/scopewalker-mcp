# AGENTS.md

## Commands

```bash
npm run build          # Build
npm run check          # Lint + typecheck (run before committing)
npm run test           # Run tests
npm run test:coverage  # Tests with coverage
```

## Scopewalker MCP Tools

Use the project's own MCP tools to understand and validate code:

| Tool | Purpose |
|------|---------|
| `get_line_counts` | File line metrics (code/blank/comment) |
| `get_functions` | Function counts and per-function line metrics (`detail=lines`) |
| `check_thresholds` | Verify size limits (files <300, functions <100 lines) |
| `get_code_inventory` | Classes, functions, exports |
| `get_complexity_metrics` | Nesting depth, params, cognitive complexity |
| `get_documentation_coverage` | Find undocumented functions/classes |
| `get_code_smells` | TODO, FIXME, HACK markers and unsafe casts |
| `get_prop_drilling` | Detect parameter threading across function chains (`summary_only`, `min_occurrences`) |

Run `check_thresholds` before committing.

## Core Principle

**Thin orchestration layer over battle-tested libraries.**

- `tree-sitter` for parsing, `tokei` for line counting, `fast-glob` for file discovery
- Roll our own only for MCP protocol glue and response formatting

## Code Standards

- Files <300 lines, functions <100 lines
- TypeScript strict mode: no `any`, explicit return types, no unused vars/params
- Functional style: pure functions preferred, minimal classes
- Interface-level tests, no external services, mock dependencies
- JSDoc on exported functions

## Key Patterns

### MCP Tool Registration

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

### Error Handling

- Structured errors with code, message, context
- Codes: `PATH_NOT_FOUND`, `PARSE_ERROR`, `UNSUPPORTED_LANGUAGE`, `TOOL_NOT_AVAILABLE`
- Set `isError: true` for error responses

### Testing

```typescript
const handler = getToolHandler(registerMyTool, "tool_name");
const response = await handler({ path: testDir });
const result = parseContent<ResultType>(response);
```

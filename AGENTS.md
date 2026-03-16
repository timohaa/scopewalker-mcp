# AGENTS.md

MCP server providing codebase analysis tools for AI assistants. Thin orchestration layer over `tree-sitter` (parsing), `tokei` (line counting), and `fast-glob` (file discovery).

## Commands

```bash
npm run build          # Build
npm run check          # Lint + typecheck (run before committing)
npm run test           # Run tests
npm run test:coverage  # Tests with coverage
```

## Scopewalker MCP Tools

Use the project's own MCP tools to understand and validate code. Run `check_thresholds` before committing.

See [TOOLS.md](./TOOLS.md) for the full tool reference and [docs/](./docs/) for detailed documentation.

## Code Standards

- Files <300 lines, functions <100 lines
- Functional style: pure functions preferred, minimal classes
- Interface-level tests; mock dependencies, no external services
- Avoid parameter threading through multiple function layers; use module-scoped config or direct imports instead
- JSDoc on exported functions

## Key Patterns

See [docs/patterns.md](./docs/patterns.md) for code examples (tool registration, error handling, testing).

### Code Intelligence

Prefer LSP over Grep/Read for code navigation:

- `workspaceSymbol` to find definitions
- `findReferences` for all usages
- `goToDefinition` / `goToImplementation` to jump to source
- `hover` for type info without reading the file

Use Grep only for text/pattern searches (comments, strings, config). Check LSP diagnostics after editing code.

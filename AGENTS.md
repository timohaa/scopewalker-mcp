# AGENTS.md

## What

MCP server providing codebase analysis tools for AI assistants. Thin orchestration layer over `tree-sitter` (parsing), `tokei` (line counting), and `fast-glob` (file discovery).

## Why

Gives AI coding agents quantitative visibility into codebases — complexity, prop drilling, documentation coverage, code smells — so they can make informed refactoring and review decisions.

## How

```bash
npm run build          # Build
npm run check          # Lint + typecheck (run before committing)
npm run test           # Run tests
npm run test:coverage  # Tests with coverage
```

Use the project's own MCP tools to understand and validate code. Run `check_thresholds` before committing.

Prefer LSP over Grep/Read for code navigation (`workspaceSymbol`, `findReferences`, `goToDefinition`, `hover`). Use Grep only for text/pattern searches.

## Behavior

- **Think before coding.** If a request is ambiguous, sketch a short plan and surface assumptions/tradeoffs before editing.
- **Minimum footprint.** Write the minimum code that solves the problem — no speculative abstractions, no drive-by renames, no unrelated cleanup bundled into the same change.
- **Verify, don't trust.** Define a success criterion before starting and loop until it's met. `npm run check` is necessary but not sufficient to confirm a tool's actual output — verify behavior with the tool itself or its tests.
- **Never create `_enhanced`, `_v2`, or `_new` duplicate file variants** — edit the original file.

## Reference Docs

- [TOOLS.md](./TOOLS.md) — tool reference
- [docs/](./docs/) — detailed tool documentation
- `.claude/skills/create-tool`, `.claude/skills/create-test` — workflows and code examples for adding tools/tests
- `/polish`, `/review-changes`, `/check-quality`, `/run-tests` — quality-pipeline slash commands (see `.claude/skills/` for the rest)
- `.claude/agents/` — specialized agents for standards, testing, docs, and code-quality enforcement (see directory for the full list)

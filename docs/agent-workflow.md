# Agent Workflow

Working method for agents in this repository. The rules in [AGENTS.md](../AGENTS.md) take precedence.

## Commands

```bash
npm run build          # Build
npm run check          # Version sync + lint + typecheck (run before committing)
npm run test           # Run tests
npm run test:coverage  # Tests with coverage
```

Pass every target file to one command (`npx vitest run a.test.ts b.test.ts`, `npx markdownlint-cli f1 f2`, or one `grep -nE` across all files).

## Method

- For ambiguous requests, sketch a short plan and state assumptions and tradeoffs before editing.
- Write the minimum code that solves the problem. Avoid speculative abstractions, drive-by renames, and unrelated cleanup.
- Define a success criterion before starting and loop until it passes. Verify tool output with the tool itself or its tests; `npm run check` alone is insufficient.
- **Never create `_enhanced`, `_v2`, or `_new` duplicate file variants**; edit the original file.
- Use the project's own MCP tools to understand and validate code.
- If LSP tools are available in your session, prefer them (`workspaceSymbol`, `findReferences`, `goToDefinition`, `hover`) over Grep/Read for code navigation; otherwise use Grep for text/pattern searches.

## Code Quality

For source/test changes, enforce [code-quality.md](./code-quality.md) before completion or committing.
Fix actionable findings in scope and rerun the detecting tools; unresolved findings or incomplete scans cannot pass.

## Tests

- Tests shell out to the real `tokei` binary. If it is missing, the test fails; do not add a skip condition.
- Tool tests run the real `tokei` binary and real parsers on files they write. Do not mock a success payload; wrap the real function in a spy (`vi.fn(actual.analyze)`) when a test needs call arguments.
- Mock only to inject a fault the real tool cannot produce on demand (spawn error, timeout, oversized output). Prefer a real failure where one exists, such as `vi.stubEnv("PATH", "")` for a missing binary.
- Recorded inputs live in `src/__fixtures__/`.
- Follow `.claude/skills/create-test` for layout, naming, and harness selection.

## Reference

- [TOOLS.md](../TOOLS.md): tool reference
- [docs/](./): tool documentation and enforcement requirements; check [known-bugs.md](./known-bugs.md) before chasing unexpected output
- `.claude/skills/create-tool`, `.claude/skills/create-test`: workflows and code examples for adding tools/tests
- `/polish`, `/review-changes`: quality-pipeline slash commands (see `.claude/skills/` for the rest)
- `.claude/agents/`: specialized agents for standards, testing, docs, and code-quality enforcement (see directory for the full list)

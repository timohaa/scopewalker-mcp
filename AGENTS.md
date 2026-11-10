# AGENTS.md

MCP server providing codebase analysis tools for AI assistants. `npm run check` runs version sync, lint, and typecheck; `npm run test` runs the tests.

## Tests

- A test must be able to fail: never copy the implementation's logic into the test or write assertions that are always true.
- Name each test module for the behaviour it pins.
- Never skip silently. A missing dependency or fixture is a failure, not a skip.
- Tests run only on recorded data in the repo, never against live systems.
- Don't hand-write fake responses. Record the real response as a fixture and test against it.
- A flaky test is a top-severity bug: fix the cause, don't retry or disable.

## Code

- Search for existing code before writing new; reuse or extract, never copy-paste.
- Never silence a linter, type checker or test (`noqa`, `type: ignore`, `eslint-disable`, `@ts-ignore`, `skip`). Fix the cause, or stop and ask.
- Don't weaken or bypass a check, hook or CI gate to get a change through.

## Scope

- Write only inside your own working clone.
- Don't delete or rename files you didn't create in this task unless the task says so. List any deletions in the PR description.
- Keep the diff to what the task needs.

## Before finishing

- Run the tests and linters, and report the actual results, including failures.
- Source/test changes must pass [docs/code-quality.md](./docs/code-quality.md).

## This file

- Keep it under 2 KB. Put detail in topic files and link to them here.

## Topic files

- [docs/agent-workflow.md](./docs/agent-workflow.md): commands, method, navigation, skills and agents
- [docs/writing-style.md](./docs/writing-style.md): required for chat, commits, PRs, and docs
- [docs/codex-workflows.md](./docs/codex-workflows.md): Codex entrypoints and adapters

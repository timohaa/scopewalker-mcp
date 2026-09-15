---
name: docs-reality-sync
description: Audit documentation against code and fix stale paths, tool arguments, commands, examples, and workflow references. Use after refactoring or when documentation may be stale.
model: sonnet
tools: Bash, Read, Edit, Write, Glob, Grep, WebFetch, WebSearch, mcp__scopewalker__get_code_inventory, mcp__scopewalker__get_functions, mcp__plugin_context7_context7__resolve-library-id, mcp__plugin_context7_context7__query-docs
---

# Documentation Reality Sync

Keep documentation accurate without weakening the requirements it describes.

## Scope

Use an explicit caller-provided scope when supplied; otherwise audit:

- Root Markdown and `docs/`, including reproductions in `docs/known-bugs.md`.
- Shared skills and agents under `.claude/`.
- Codex entrypoints under `.agents/skills/` and `.codex/agents/`.

Follow references affected by the change even when they live outside the initial file list.

## Audit and Fix

- Match tool names to registrations in `src/server.ts` and parameters to schemas in `src/tools/*.ts`.
- Verify documented symbols with `get_code_inventory` or `get_functions`.
- Check commands and versions against `package.json`; verify paths and local links.
- Check source skill/agent descriptions against Codex entrypoint descriptions and verify every shared-workflow link.
- Preserve `polish`'s explicit-only invocation policy in both clients.
- Distinguish tool defaults from project policy. Verify that enforcement examples require resolution, rescans, and accurate failure reporting.
- Preserve [docs/code-quality.md](../../docs/code-quality.md) requirements when trimming repeated tool catalogs or report templates.
- Verify Claude `@path` imports resolve. Verify Codex discovery guidance against official OpenAI documentation; do not treat Claude imports as Codex discovery.
- Verify dependency or client behavior against upstream documentation using available documentation or web tools.
- Reproduce affected known-bug entries before removing them or claiming they are fixed.

Fix factual discrepancies and remove proven stale or duplicate prose within the assigned scope.
Do not defer a correction merely because it needs a section rewrite.
When code and documented intent conflict, report the evidence and unresolved decision instead of inventing behavior.

## Verify and Report

Collect referenced paths, tools, and scripts, then validate each set in one batched command.
Check examples against the real tool schemas and walk through the instructions for contradictions.
Leave Markdown formatting to `markdown-quality-fixer`.

Report changes, checks performed, and unresolved discrepancies.
A broken workflow reference or an example that bypasses enforcement prevents a PASS verdict.

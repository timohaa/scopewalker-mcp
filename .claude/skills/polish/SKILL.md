---
name: polish
description: Run the full quality pipeline (lint/type/format fix, test fix, standards enforcement, comment cleanup, a verification gate, docs sync, AGENTS.md enforcement, and markdown lint) in sequence using subagents.
disable-model-invocation: true
---

# Polish

Run the full quality pipeline as a sequence of subagents launched via the **Agent tool**.
Each step builds on the previous one, so they run **sequentially, not in parallel**.

## Pipeline

Run these subagents **in this exact order**, one at a time, using the Agent tool with the
`subagent_type` shown below. Wait for each to complete before starting the next.

| Step | `subagent_type`          | Purpose                                                                                                                                                                                                                                                                                 |
|------|--------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1    | `lint-type-format-fixer` | Fix all lint errors, type errors, and formatting issues so later agents work on clean code.                                                                                                                                                                                             |
| 2    | `smart-test-fixer`       | Run tests and fix any failures. Include in the prompt: "lint/typecheck was just verified green; start with `npm run test` only, and run `npm run check` only after you edit source files."                                                                                              |
| 3    | `standards-enforcer`     | Scan for coding standards violations (file length <300 lines, function length <100 lines, nesting depth, too many parameters) and fix them.                                                                                                                                             |
| 4    | `comment-fixer`          | Clean up comments (remove redundant, fix misleading, ensure comments explain WHY not WHAT).                                                                                                                                                                                             |
| 5    | (no subagent)            | **Verification gate.** If steps 3–4 changed any files, run `npm run check && npm run test` directly via Bash. Skip if steps 3–4 made no changes. Only if it fails, launch the matching fixer agent (`lint-type-format-fixer` for check failures, `smart-test-fixer` for test failures). |
| 6    | `docs-reality-sync`      | Audit and sync documentation (`README.md`, `TOOLS.md`, `docs/`, `AGENTS.md`, `.claude/`) with the final codebase state.                                                                                                                                                                 |
| 7    | `agents-md-enforcer`     | Audit `AGENTS.md` (and its `@path` imports) against Anthropic's Claude Code best practices: prune derivable, redundant, or platitudinous content; tighten vague rules; verify references.                                                                                               |
| 8    | `markdown-quality-fixer` | Lint and format all modified markdown files. Runs last to catch `.md` changes from earlier steps (especially docs-reality-sync and agents-md-enforcer).                                                                                                                                 |

## Workflow

For each step, announce it (e.g., "**Step 1/8: Fixing lint, types, and formatting...**"),
launch the subagent via the **Agent tool** with the `subagent_type` from the table, wait
for completion, and summarize the result before moving on.

**Verification gate (step 5):** Run the command directly; do not launch a subagent unless
it fails. If steps 3–4 made no code changes, skip it and note "skipped: no changes from
steps 3–4" in the summary.

After all steps, print a final summary:

```markdown
## Polish Complete

| Step | Agent                      | Result |
|------|----------------------------|--------|
| 1    | lint-type-format-fixer     | ...    |
| 2    | smart-test-fixer           | ...    |
| 3    | standards-enforcer         | ...    |
| 4    | comment-fixer              | ...    |
| 5    | verification gate (direct) | ...    |
| 6    | docs-reality-sync          | ...    |
| 7    | agents-md-enforcer         | ...    |
| 8    | markdown-quality-fixer     | ...    |
```

## Notes

- If a step fails or produces errors that cannot be auto-fixed, note it in the summary and continue to the next step.
- Do not skip steps (except the verification gate per the rule above); even if the codebase looks clean, each agent may catch issues the others miss.

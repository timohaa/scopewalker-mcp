---
name: polish
description: Run the full quality pipeline — lint/type/format fix, test fix, standards enforcement, comment cleanup, second-pass fixes, docs sync, AGENTS.md enforcement, and markdown lint — in sequence using subagents.
disable-model-invocation: true
---

# Polish

Run the full quality pipeline as a sequence of subagents launched via the **Agent tool**.
Each step builds on the previous one, so they run **sequentially, not in parallel**.

## Pipeline

Run these subagents **in this exact order**, one at a time, using the Agent tool with the
`subagent_type` shown below. Wait for each to complete before starting the next.

| Step | `subagent_type`          | Purpose                                                                              |
|------|--------------------------|--------------------------------------------------------------------------------------|
| 1    | `lint-type-format-fixer` | Fix all lint errors, type errors, and formatting issues so later agents work on clean code. |
| 2    | `smart-test-fixer`       | Run tests and fix any failures. Working on code that already passes lint/type checks avoids churn. |
| 3    | `standards-enforcer`     | Scan for coding standards violations (file length <300 lines, function length <100 lines, nesting depth, too many parameters) and fix them. |
| 4    | `comment-fixer`          | Clean up comments (remove redundant, fix misleading, ensure comments explain WHY not WHAT). |
| 5    | `lint-type-format-fixer` | **Second pass.** Re-run after standards-enforcer — skip if steps 3–4 made no changes. |
| 6    | `smart-test-fixer`       | **Second pass.** Re-run after standards-enforcer — skip if steps 3–4 made no changes. |
| 7    | `docs-reality-sync`      | Audit and sync documentation (`TOOLS.md`, `docs/`, `AGENTS.md`) with the final codebase state. |
| 8    | `agents-md-enforcer`     | Audit `AGENTS.md` (and its `@path` imports) against Anthropic's Claude Code best practices: prune derivable, redundant, or platitudinous content; tighten vague rules; verify references. |
| 9    | `markdown-quality-fixer` | Lint and format all modified markdown files. Runs last to catch `.md` changes from earlier steps (especially docs-reality-sync and agents-md-enforcer). |

## Workflow

For each step, announce it (e.g., "**Step 1/9: Fixing lint, types, and formatting...**"),
launch the subagent via the **Agent tool** with the `subagent_type` from the table, wait
for completion, and summarize the result before moving on.

**Second-pass rule:** Steps 5 and 6 may be skipped if steps 3–4 made no code changes. If skipped, note "skipped — no changes from steps 3–4" in the summary.

After all steps, print a final summary:

```markdown
## Polish Complete

| Step | Agent                         | Result |
|------|-------------------------------|--------|
| 1    | lint-type-format-fixer        | ...    |
| 2    | smart-test-fixer              | ...    |
| 3    | standards-enforcer            | ...    |
| 4    | comment-fixer                 | ...    |
| 5    | lint-type-format-fixer (2nd)  | ...    |
| 6    | smart-test-fixer (2nd)        | ...    |
| 7    | docs-reality-sync             | ...    |
| 8    | agents-md-enforcer            | ...    |
| 9    | markdown-quality-fixer        | ...    |
```

## Notes

- If a step fails or produces errors that cannot be auto-fixed, note it in the summary and continue to the next step.
- Do not skip steps (except second-pass steps per the rule above) — even if the codebase looks clean, each agent may catch issues the others miss.

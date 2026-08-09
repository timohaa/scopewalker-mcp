---
name: polish
description: Run the full quality pipeline (lint/type/format fix, test fix, standards enforcement, comment cleanup, docs sync, AGENTS.md enforcement, and markdown lint) using subagents. Defaults to changed-files scope for comment cleanup; pass `full` for a whole-codebase sweep.
disable-model-invocation: true
---

# Polish

Run the full quality pipeline as subagents launched via the **Agent tool**.
Steps run sequentially except 4a/4b, which run in parallel (they edit disjoint
file sets: `src/**/*.ts` vs `*.md`).

## Scope

Default scope is changed files: comment-fixer processes recently changed `.ts`
files only. `/polish full` passes `full` to comment-fixer for a whole-`src/`
comment sweep. Nothing else differs between the modes.

## Pipeline

Run these subagents **in this order** using the Agent tool with the
`subagent_type` shown below. Launch 4a and 4b as **two Agent calls in a single
message** so they run concurrently; wait for both before step 5. Wait for every
other step to complete before starting the next.

| Step | `subagent_type`          | Purpose                                                                                                                                                                                                                                                       |
|------|--------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1    | `lint-type-format-fixer` | Fix all lint errors, type errors, and formatting issues so later agents work on clean code.                                                                                                                                                                   |
| 2    | `smart-test-fixer`       | Run tests and fix any failures. Include in the prompt: "lint/typecheck was just verified green; start with `npm run test` only, and run `npm run check` only after you edit source files."                                                                    |
| 3    | `standards-enforcer`     | Scan for coding standards violations (file length <300 lines, function length <100 lines, nesting depth, too many parameters) and fix them. Runs the full test suite only if it edited.                                                                       |
| 4a   | `comment-fixer`          | Clean up comments (remove redundant, fix misleading, ensure comments explain WHY not WHAT). Changed files by default; include `full` in the prompt only when polish was invoked with `full`. Runs `npm run check` only if it edited. Launch together with 4b. |
| 4b   | `docs-reality-sync`      | Audit and sync documentation (`README.md`, `TOOLS.md`, `docs/`, `AGENTS.md`, `.claude/`) with the final codebase state. Launch together with 4a.                                                                                                              |
| 5    | `agents-md-enforcer`     | Audit `AGENTS.md` (and its `@path` imports) against Anthropic's Claude Code best practices: prune derivable, redundant, or platitudinous content; tighten vague rules; verify references. Runs after 4b so pruning sees the fact-checked content.             |
| 6    | `markdown-quality-fixer` | Lint and format all modified markdown files. Runs last to catch `.md` changes from earlier steps (especially docs-reality-sync and agents-md-enforcer).                                                                                                       |

## Workflow

For each step, announce it (e.g., "**Step 1/6: Fixing lint, types, and formatting...**";
announce 4a and 4b together as "**Step 4/6: Comment cleanup ∥ docs sync...**"),
launch the subagent(s) via the **Agent tool** with the `subagent_type` from the
table, wait for completion, and summarize the result before moving on.

Verification lives inside the agents: step 3 runs the full suite only when it
changed files, and step 4a runs `npm run check` only when it edited. There is no
separate verification-gate step. If a step reports a check or test failure it
could not fix, launch the matching fixer (`lint-type-format-fixer` for check
failures, `smart-test-fixer` for test failures) before continuing.

After all steps, print a final summary:

```markdown
## Polish Complete

| Step | Agent                  | Result |
|------|------------------------|--------|
| 1    | lint-type-format-fixer | ...    |
| 2    | smart-test-fixer       | ...    |
| 3    | standards-enforcer     | ...    |
| 4a   | comment-fixer          | ...    |
| 4b   | docs-reality-sync      | ...    |
| 5    | agents-md-enforcer     | ...    |
| 6    | markdown-quality-fixer | ...    |
```

## Notes

- If a step fails or produces errors that cannot be auto-fixed, note it in the summary and continue to the next step.
- Do not skip steps; even if the codebase looks clean, each agent may catch issues the others miss.

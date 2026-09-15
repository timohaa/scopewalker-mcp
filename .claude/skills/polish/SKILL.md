---
name: polish
description: Run the quality fixer pipeline with subagents and require verified resolution of actionable findings. Defaults to changed source files; pass `full` for all source files.
disable-model-invocation: true
---

# Polish

Read [docs/code-quality.md](../../../docs/code-quality.md).
Success requires its PASS verdict after the last edit.

## Scope and Handoffs

Default: uncommitted files plus files affected by this task. `full` includes all of `src/`.
Pass the explicit scope to every agent; extend it when a step creates or changes files.
Repository-wide checks still run where the agent requires them.
For documentation-only work, mark source-only steps N/A and run the documentation steps.

Each handoff includes changed files, outstanding findings, and verification already completed.
An assigned finding stays open until its owner returns a fix and verification or an evidenced disposition.

## Pipeline

Use the Agent tool in this order. Wait for each step, except launch 4a/4b together
and wait for both. Restrict 4a to source comments and 4b to documentation files.

| Step | `subagent_type`          | Required result                                                                                 |
|------|--------------------------|-------------------------------------------------------------------------------------------------|
| 1    | `lint-type-format-fixer` | Fix lint, type, and formatting failures.                                                        |
| 2    | `smart-test-fixer`       | Fix test failures. Pass step 1's verification so unchanged checks are not repeated.             |
| 3    | `standards-enforcer`     | Resolve all actionable size, complexity, smell, prop-drilling, and dead-code findings in scope. |
| 4a   | `comment-fixer`          | Resolve documentation findings in the assigned source files. Pass `full` only for full mode.    |
| 4b   | `docs-reality-sync`      | Sync affected docs and workflow references, including `.agents/skills/` and `.codex/agents/`.   |
| 5    | `agents-md-enforcer`     | Prune redundant instructions while preserving enforcement requirements and working entrypoints. |
| 6    | `markdown-quality-fixer` | Fix Markdown lint and table formatting for all Markdown changed by the pipeline.                |

Announce each step and summarize its result. Route fixable check/test failures back to
the responsible fixer. Complete independent work when one finding is blocked, but carry
the failure into the final verdict.

## Verify the Final State

- Rerun Scopewalker checks affected by edits after step 3. Comment additions can exceed size limits.
- If executable code changed after the last successful tests, rerun the relevant tests and required final checks.
- Reuse successful verification only while relevant inputs and requirements remain unchanged. Changes to dependencies, configuration, imports, or consumers can invalidate earlier results.
- If a rescan finds violations, return them to the responsible fixer and reverify its edits.
- Recheck every outstanding handoff. A promised fix or suggested follow-up cannot count as resolved.

Report step results, applied fixes, retained findings with evidence, and final verification.
Use **PASS**, **FAIL**, or **BLOCKED**. Say "Polish complete" only for PASS.

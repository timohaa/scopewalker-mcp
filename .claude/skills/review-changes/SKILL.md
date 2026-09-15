---
name: review-changes
description: Review uncommitted changes and fail on unresolved Scopewalker findings or repository checks. Pass `full` for a whole-source audit.
---

# Review Changes

Read [docs/code-quality.md](../../../docs/code-quality.md) for required scans,
limits, finding dispositions, and verdicts. Review and report; do not refactor as part of a review.

## 1. Establish Scope

```bash
git status --porcelain
git diff
git diff --cached
```

Include staged, unstaged, and untracked files. Read new files, since diffs omit their contents.
With `full`, audit all of `src/` and run the whole-repository checks below.
An empty default scope is **N/A**, not a whole-repository pass.

## 2. Run Checks

For source/test changes or `full`:

```bash
npm run check:versions
npm run lint
npm run typecheck
npx prettier --check src
npm run test
```

Use these non-fixing scripts because `npm run check` runs `lint:fix`.
Run the shared Scopewalker checks for the selected scope. Inspect all in-scope findings;
cross-file scans must cover `src/` even when only a few files changed.

For changed Markdown, run one `npx markdownlint <all changed Markdown files>` command
and verify affected links, tool arguments, and workflow references. In `full` mode,
include all tracked Markdown. Documentation-only changes need no source tests or code scans.

## 3. Review What Automation Misses

Search all changed source/test files in one command for unjustified `eslint-disable`,
`@ts-ignore`, and `console.log`. Inspect the diff for commented-out dead code.
Verify behavior changes have appropriate tests and tool changes update `TOOLS.md` and `docs/`.

Classify every Scopewalker finding using the shared dispositions. Confirmed violations are
**must fix**, including pre-existing violations inside the selected scope.
Keep optional design suggestions separate from failures.

## 4. Report

Give one result per check, the scope covered, and `file:line` details for failures.
Include observed values versus limits, evidence for non-actionable findings, and explicit exceptions.
End with **PASS**, **FAIL**, or **BLOCKED** under the shared rules.
Do not recommend committing while required checks or actionable findings remain unresolved.

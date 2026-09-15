# Usage Examples

Make Scopewalker findings part of the completion criteria for coding work.
The examples below require fixes, rescans, and evidence for retained findings.
Adapt the source roots, extensions, and project limits before copying them.

## Add Enforcement to Project Instructions

Add the rules to your existing project instructions, such as `AGENTS.md` or `CLAUDE.md`.
The examples use `AGENTS.md`; adjust that reference to match your setup.

```markdown
## Code Quality

After source/test changes and before committing, run Scopewalker on the affected code.
Default scope includes changed files and files affected by the task. A full audit includes all source files.
Fix actionable findings in scope and rerun the detecting tool with the same arguments.

- check_thresholds: max_file_lines 300, max_function_lines 100; include tests.
- get_complexity_metrics: maximum nesting 4, parameters 5, per-function cyclomatic complexity 10.
- get_code_smells: resolve active markers and unsafe casts; remove only demonstrably stale markers.
- get_prop_drilling: min_occurrences 3, exclude_common true; trace and fix unnecessary pass-through chains.
- find_dead_code: scan each complete production source root; remove confirmed unreachable internal code.

Inspect every finding. Cite code or caller evidence for non-actionable results.
Retain exceptions only when an existing project rule or explicit user decision allows them.
Do not raise limits, hide files, add suppressions, or erase active markers to get a pass.

PASS requires complete checks and no unresolved actionable findings.
FAIL means confirmed violations or failing checks remain.
BLOCKED means required tools, scan coverage, or evidence are unavailable.
Passing lint and tests does not override unresolved Scopewalker findings.
```

These complexity limits are an example project policy. Cognitive complexity summed
over a file helps prioritize inspection; it is not a per-function failure threshold.

## Make Scan Coverage Part of the Result

Include these rules in the shared policy or a linked enforcement reference:

- Pass language extensions explicitly, such as `[".ts", ".tsx"]` or `[".py"]`.
- Run local checks on affected directories. Run dead-code and parameter-threading analysis on each complete source root.
- Exclude test files from production dead-code analysis using the project's actual test patterns. Inspect test callers before removing code.
- Require `summary.scan_complete: true` and no depth/file caps before treating a `dead_code` item as removable.
- Investigate `unreferenced_exports`; consumers outside the scan can use them. Preserve public APIs and framework entry points without removal authorization.
- Inspect `forwarding_evidence` and actual callers for prop drilling. Shared parameter names do not prove a connected pass-through chain.
- Check summary counts against returned details. Increase `limit` or inspect narrower paths until every in-scope finding has a disposition.
- Complexity details contain at most 10 high-complexity functions per file. Fix and rescan to reveal remaining findings.
- Inspect skipped files and completeness fields where available. An error, missing tool, or unexpectedly empty scan cannot pass.
- Never exclude tests from size checks merely because suite callbacks are large. Split suites by behavior without weakening assertions.

See [tool limits and supported languages](tools-overview.md) and
[known limitations](known-bugs.md) before interpreting incomplete output.
For example, unsupported extension filters can silently return nothing from tokei-backed tools.

## Review Skill: Fail on Unresolved Findings

A review can enforce standards without editing code. Use non-fixing check commands
and require a verdict. This example assumes the AGENTS.md policy above.

```markdown
---
name: check-quality
description: Review code quality and fail on unresolved Scopewalker findings. Reports only; use a fixer workflow to resolve failures.
---

# Check Quality

Read AGENTS.md and its linked enforcement requirements.
Use the caller's scope; default to staged, unstaged, and untracked source/test changes.
With full, audit every source root.

1. Read the diff and new files.
2. Run the project's non-fixing lint, type, format, and test commands.
3. Run all required Scopewalker checks. Cross-file scans cover complete source roots.
4. Inspect every in-scope finding, including findings that predate the current changes.
5. Report file:line, observed value versus limit, and one disposition per finding:
   fixed and verified, non-actionable with evidence, accepted exception, or unresolved.

End with PASS, FAIL, or BLOCKED under the shared policy.
Do not recommend committing while actionable findings remain unresolved.
```

In this repository, `npm run check` invokes `lint:fix`.
The [review workflow](../.claude/skills/review-changes/SKILL.md) uses separate
non-fixing scripts and also validates changed documentation.

## Fixer Agent: Resolve and Rescan

Give the fixer the tools needed for its required checks.
Match the MCP prefix to the server name configured in the client.

```markdown
---
name: standards-enforcer
description: Fix actionable Scopewalker findings and verify the final state with rescans and tests.
tools: Bash, Read, Edit, Write, Glob, Grep, mcp__scopewalker__check_thresholds, mcp__scopewalker__get_complexity_metrics, mcp__scopewalker__get_code_smells, mcp__scopewalker__get_prop_drilling, mcp__scopewalker__find_dead_code
---

# Standards Enforcer

Read AGENTS.md and its linked enforcement requirements.
Run every required check for the assigned scope and resolve actionable findings.

Before structural refactoring, run covering tests and add characterization tests if coverage is insufficient.
Split oversized files/functions, simplify complex branches, and remove confirmed dead internal symbols.
Fix unnecessary parameter forwarding using existing dependency patterns.
Resolve the underlying problem behind active markers and unsafe casts.

Preserve public behavior. Do not defer module extraction merely because it touches several files.
If a fix requires a behavior or public API change, report that conflict and complete independent fixes.

After each pass, rerun the detecting tools with the same scope and limits and run the covering tests.
After the final code edit, run the project's required checks, tests, and build.
Verify scans again if formatting changed the measured files.

Report before/after counts and evidence for every retained finding.
Return PASS only when required checks pass and no actionable findings remain unresolved.
Zero edits, a tracking issue, or a suggested future refactor cannot establish a pass.
```

The [repository agent](../.claude/agents/standards-enforcer.md) implements this workflow.
Documentation coverage belongs to [comment-fixer](../.claude/agents/comment-fixer.md):
it resolves missing documentation under the project's JSDoc rules and checks size limits after comment edits.

## Polish: Verify After the Last Edit

A fixer pipeline must carry unresolved findings between agents and verify the final state:

```markdown
1. Run lint/type/format fixes, then test fixes.
2. Have standards-enforcer resolve the required Scopewalker findings.
3. Run comment cleanup and documentation sync on their assigned files.
4. Prune redundant instructions while preserving enforcement rules, then format Markdown.
5. Rerun checks affected by later edits. Comment additions can create size violations.
6. Return new violations to their owner and verify its fixes.
7. Report PASS only after all required checks and outstanding findings are resolved.
   Otherwise report FAIL or BLOCKED with the remaining findings.
```

Pass the scope, changed files, unresolved findings, and completed verification to each agent.
Reuse successful verification only when relevant inputs and requirements are unchanged, including dependencies and configuration.
The [polish workflow](../.claude/skills/polish/SKILL.md) preserves this sequence.

## Optional: Share Instructions Across Coding Tools

If you use several coding tools, you can maintain common instructions once and reuse them.
This is a convenience tip; Scopewalker does not require a particular instruction-file layout.

| Coding tool | How to reuse a shared `AGENTS.md`                                                                                                                                                 |
|-------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Claude Code | Put `@AGENTS.md` in a root `CLAUDE.md`. Relative imports resolve from the importing file. [Claude documentation](https://code.claude.com/docs/en/memory#import-additional-files). |
| Gemini CLI  | Put `@./AGENTS.md` in a root `GEMINI.md`, or configure `context.fileName` to load `AGENTS.md` directly. [Gemini documentation](https://geminicli.com/docs/cli/gemini-md/).        |
| Codex       | Reads `AGENTS.md` directly through its instruction hierarchy; no pointer file is needed. [OpenAI documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md).    |
| Cursor      | Reads root and nested `AGENTS.md` files directly. Project rules can also include files using `@filename` references. [Cursor documentation](https://cursor.com/docs/rules).       |

The loading mechanisms differ; `@path` is not a universal instruction-file convention.
Use the mechanism documented by your coding tool and check that it loaded the intended instructions.

### This Repository's Workflow Layout

This repository keeps the workflow bodies in `.claude/`.
Codex skills in `.agents/skills/` and agents in `.codex/agents/` load those shared files.
Keep their descriptions and references synchronized. These entrypoint locations follow
OpenAI's [skills](https://learn.chatgpt.com/docs/build-skills) and
[subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) documentation.

The repository's [Codex adapters](../AGENTS.md#codex-workflows) handle client-specific instructions.
Its polish entrypoints are explicit-only.

Maintain one enforcement reference instead of repeating tool catalogs in every skill.
This repository uses [code-quality.md](code-quality.md).
Inventory and line-count tools can answer navigation questions when needed; they do not establish compliance.

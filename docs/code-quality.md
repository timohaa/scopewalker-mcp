# Code Quality Enforcement

Shared requirements for implementation, review, and polish workflows.
Scopewalker findings require a disposition before the scoped work can pass.

## Scope

- Default: staged, unstaged, and untracked source/test files, plus files affected by the task or its fixes.
- `full`: all of `src/`. Pre-existing violations in this scope must be resolved too.
- Scan containing directories for local checks. Run cross-file analysis on the complete `src/` root, then identify in-scope findings.
- Report findings outside the task scope separately; do not silently expand an ordinary change into a repository refactor.
- Documentation-only work needs Markdown and reference validation; mark code scans **N/A** when no source/test files changed.

## Required Checks

Pass `extensions: [".ts"]`. Keep tests and fixtures in size checks.
Run the first five tools for executable source changes and full standards/review audits.
Test-only changes need the first three.
Comment-only work needs size checks and documentation coverage on its assigned source files.

| Tool                         | Required action                                                                                                                               |
|------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| `check_thresholds`           | Pass `max_file_lines: 300`, `max_function_lines: 100`. Fix every oversized file/function in scope, including tests.                           |
| `get_complexity_metrics`     | Fix nesting above 4, parameter counts above 5, and per-function cyclomatic complexity above 10.                                               |
| `get_code_smells`            | Inspect every marker and unsafe cast. Fix the underlying issue or remove a demonstrably stale marker.                                         |
| `get_prop_drilling`          | Pass `min_occurrences: 3`, `exclude_common: true`. Trace reported forwarding and fix confirmed unnecessary pass-through chains.               |
| `find_dead_code`             | Scan the whole production source root. Remove confirmed unreachable internal symbols; investigate every `unreferenced_exports` item in scope. |
| `get_documentation_coverage` | Identify missing documentation, apply the comment-fixer's JSDoc rules, and verify the result.                                                 |

Use inventory, function listings, and line counts when needed to inspect a finding.
They do not replace these checks.

### Interpret findings from source

- Complexity limits above are project policy. Whole-file cognitive complexity is a prioritization metric, not a per-function limit.
- Prop drilling is name-based. `forwarding_evidence` does not prove a connected call chain or unused intermediate parameters. Inspect callers and parameter use before changing dependencies.
- For production dead-code analysis, exclude `**/*.test.ts`, `**/__fixtures__/**`, and `**/testUtils/**`. Record these exclusions. Inspect excluded test callers before removing code or tests.
- Require a whole-root scan without depth/file caps and `summary.scan_complete: true` before removing a `dead_code` finding. Check framework hooks, dynamic references, and entry points too.
- `unreferenced_exports` can be used outside this package. Find consumer or public-API evidence before retaining or removing one. Uncertainty remains unresolved; it is not permission to delete an export.
- This server analyzes code smells itself. Marker names in explanatory comments and deliberate parser fixtures can be non-actionable. Cite the specific source or test that establishes this.
- Do not erase an active TODO, rename a threaded parameter, add a suppression, raise a limit, or exclude a violating file to make a scan pass.

### Verify scan coverage

Read [known-bugs.md](./known-bugs.md) when output is unexpected.
Inspect summaries and scan counts, not just returned arrays.

- `limit` trims details after analysis. Increase it or inspect narrower paths until all in-scope findings are accounted for.
- Complexity reports at most 10 high-complexity functions per file. Fix and rescan until summary totals and retained findings are reconciled.
- `summary_only: true` is insufficient for resolving findings. Retrieve the details.
- `max_files`, `max_depth`, parse failures, and skipped files can leave gaps. Resolve gaps or report **BLOCKED** for the affected check.
- Where provided, require `scan_complete: true` and inspect `files_skipped`. Threshold completeness describes only the function pass.
- A tool error, unsupported extension, unexpectedly empty scan, or unavailable MCP server cannot count as a pass. Report the missing coverage.
- Preserve the original scope and arguments when rescanning. If diagnostic scans narrow the path, finish by verifying the original scope.

## Resolve and Verify

Reviews report failures. Implementation and fixer workflows must fix actionable findings in their assigned scope.
Use behavior-preserving refactors; add characterization tests before structural changes when existing coverage is insufficient.
Verify each fix with the detecting tool and the relevant tests.

Every finding needs one disposition, with `file:line` and evidence:

- **Fixed**: describe the change and the successful rescan.
- **Not actionable**: cite code, callers, or a test proving the detector does not identify a standards violation here.
- **Accepted exception**: cite an existing project rule or explicit user decision for this specific violation.
- **Unresolved**: name the remaining violation or missing evidence and the next concrete action.

Being pre-existing, inconvenient, or below a "critical" severity is not an exception.
A tracking issue or suggested future refactor does not resolve a violation.
Do not claim completion while another agent still owns an unresolved finding.

## Verdict

Report the scope, check results, before/after counts, and any exceptions or unresolved findings.

- **PASS**: required checks cover the scope, actionable findings are resolved, and verification passes. List accepted exceptions explicitly.
- **FAIL**: confirmed in-scope violations or failing checks remain.
- **BLOCKED**: required tools, coverage, or evidence are unavailable. Include any known failures alongside the blocker.

Zero edits does not imply a clean scan. Passing lint and tests does not override a Scopewalker failure.

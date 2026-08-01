# Usage Examples

This page shows how to hook Scopewalker up to agentic coding tools like
Claude Code. Nothing here is language-specific; the same setup works for
TypeScript/React, Python, C, Rust, GDScript, or a mix. There are four
places to plug it in:

1. `AGENTS.md` / `CLAUDE.md`: make every session aware of the tools and thresholds
2. Skills: packaged quality-check workflows (`/check-quality`, `/code-health-report`)
3. Subagents: enforcement agents with the tools in their allowlist
4. Permission settings: pre-approve the tools so agents run them without prompts

The same definitions also work with Antigravity CLI (`.agents/agents/`)
after some small frontmatter changes; see
[Antigravity CLI agents](#antigravity-cli-agents).

## AGENTS.md / CLAUDE.md

Keep `CLAUDE.md` as a one-line pointer so Claude Code and other agents
share one instruction file:

```markdown
# CLAUDE.md

@AGENTS.md
```

For `AGENTS.md` itself there are a few options, depending on how much
space you want to spend on the tools.

### Full tool section

The verbose option: list every tool with a one-line purpose. Useful as a
standing reminder that quantitative checks exist. Adjust the `extensions`
note and the threshold pointer for your project:

```markdown
## Use Scopewalker MCP Tools

Use scopewalker-mcp tools to understand and validate the code
(extensions `[".ts", ".tsx", ".py", ".rs"]`):

- `get_line_counts` - File line metrics (code/blank/comment)
- `get_functions` - Function counts and per-function line metrics (`detail=lines`)
- `get_code_inventory` - Find classes, functions, methods, and exports
- `check_thresholds` - Verify size limits (files <300, functions <100 lines)
- `get_complexity_metrics` - Nesting depth, params, cognitive complexity
- `get_code_smells` - TODO/FIXME-style markers and unsafe casts
- `get_documentation_coverage` - Find undocumented functions/classes
- `get_prop_drilling` - Parameters threaded through many functions/files
```

For other languages, only the extensions and the inventory description
change. A C project would use `[".c", ".h"]` and describe
`get_code_inventory` as "find functions, structs, and typedefs".

### Threshold section that delegates detail

If `AGENTS.md` is getting long, just state the limits and point at the
skill or agent that carries the full tool reference:

```markdown
## Code Quality Thresholds

Max 300 lines/file, 100 lines/function. Checked via the scopewalker
`check_thresholds` MCP tool (see `standards-enforcer` agent,
`/check-quality` skill).
```

### One-line pre-commit rule

Or go minimal and drop a single rule right after the build/check
commands:

```markdown
Run `check_thresholds` (scopewalker MCP tool) before committing to enforce
file <300 / function <100 line limits.
```

### Replacing derivable documentation

A related trick: instead of maintaining file lists or per-module
inventories in `AGENTS.md` (they go stale), tell the agent to derive
them:

```markdown
`DIRECTORY_STRUCTURE.md` documents the top-level layout; update it only when
that changes. List source files with `ls` or scopewalker `get_code_inventory`.
```

## Skills

### Read-only health check (`/check-quality`)

A report-only skill that runs the toolchain checks (lint, typecheck,
format, tests) plus the Scopewalker tools and ends with a verdict. Say
explicitly that it must not edit files; fixing belongs in a separate
skill or agent:

```markdown
---
name: check-quality
description: Run a read-only code health check (lint, typecheck, tests,
  plus scopewalker thresholds, complexity metrics, prop drilling, code
  smells, and documentation coverage). Reports only; run /polish to fix.
---

# Check Quality

**Report only. Do not edit any file.**

## Scopewalker Tools

Run these MCP tools over `src/` (and `__tests__/` for the size checks;
the limits apply to test files too) with extensions `[".ts", ".tsx"]`:

| Tool                         | Purpose                                     |
|------------------------------|---------------------------------------------|
| `check_thresholds`           | Max 300 lines/file, 100 lines/function      |
| `get_complexity_metrics`     | Nesting depth, params, cognitive complexity |
| `get_prop_drilling`          | Same prop/param name in 3+ functions        |
| `get_code_smells`            | TODO, FIXME, HACK markers                   |
| `get_documentation_coverage` | Undocumented functions/classes              |
| `get_line_counts`            | Per-file code/blank/comment metrics         |

## Report

Summarize threshold violations, complexity hotspots, prop drilling, smell
counts, and documentation gaps. End with a one-line verdict: **CLEAN**
(nothing actionable) or **NEEDS ATTENTION** (list the top items).
```

Two things you'll want to write into the skill next to the tool table:

- An arrow-function component (`const Card = () => {...}`) has no name in
  the AST, so its whole body is reported as one `<anonymous>` function;
  `function Card() {}` declarations keep their name. Either way, most
  non-trivial components show up as >100-line "functions" in
  `check_thresholds` and `get_functions detail=lines`. Have the agent list
  oversized component bodies separately
  from oversized plain functions, because extracting a subcomponent or
  hook is a different (riskier) refactor than splitting a helper.
- Run `get_prop_drilling` with `exclude_common: true` to cut noise from
  `id`/`key`-style names. If your standards prohibit prop drilling
  outright, tell the agent to treat hits as violations, not suggestions.

### Standalone health report (`/code-health-report`)

In a monorepo, a Scopewalker-only skill can carry per-subproject extensions
and a fixed report template:

```markdown
---
name: code-health-report
description: Generate a scopewalker-based code health report
  (thresholds, complexity, smells, docs).
---

## Tool Defaults

- `check_thresholds`: `max_file_lines=300`, `max_function_lines=100`
- `get_complexity_metrics`: highlight high nesting/cognitive complexity
- `get_code_smells`: `todo`, `fixme`, `hack`, `deprecated`
- `get_documentation_coverage`: undocumented functions/classes;
  `min_lines` to skip trivial ones

## Extensions

- Web/mobile: [`.ts`, `.tsx`]
- Cloud functions: [`.py`]

## Report Format

    # Code Health Report: <scope>

    ## Threshold Violations
    - Files over 300 lines: X
    - Functions over 100 lines: X

    ## Complexity Issues
    ...

    ## Recommended Actions
    1. ...
```

### Pre-commit review (`/review-changes`)

In a review skill, run Scopewalker on the modified directories only. It's
one step next to the diff review and standards checks:

```markdown
## Workflow

1. List changed files: `git status`, `git diff --name-only`.
2. Review diffs per file against AGENTS.md and project guidelines.
3. Run quality checks and scopewalker thresholds on modified directories.
4. Summarize issues with file:line references and recommend next steps.
```

### Pipeline orchestrator (`/polish`)

For actual fixing, a pipeline skill can run fixer subagents in a fixed
order: lint fixer, test fixer, standards enforcer, comment fixer, docs
sync, `AGENTS.md` enforcement, markdown lint. Scopewalker shows up in two
of those steps:

- The `standards-enforcer` step is the one that uses the full tool set
  (see the agent below).
- After the code-changing steps, a verification gate reruns
  `npm run check` and the tests, but only if the standards enforcer or
  comment fixer actually changed files. A clean run stays cheap.

## Subagents

### standards-enforcer

This agent uses the whole tool set: it detects violations and refactors
to fix them. The interesting parts of
`.claude/agents/standards-enforcer.md`:

```markdown
---
name: standards-enforcer
description: Analyzes the codebase for coding-standards violations
  (file/function length, nesting depth, parameter counts, TODO/FIXME
  markers) using the scopewalker tools, then refactors to fix them
  while keeping checks and tests green. Use proactively after
  significant code changes or for a full standards audit.
model: sonnet
tools: Bash, Read, Edit, Write, Glob, Grep, mcp__scopewalker__check_thresholds, mcp__scopewalker__get_code_smells, mcp__scopewalker__get_complexity_metrics, mcp__scopewalker__get_functions, mcp__scopewalker__get_line_counts, mcp__scopewalker__get_code_inventory, mcp__scopewalker__get_documentation_coverage, mcp__scopewalker__get_prop_drilling
---
```

The prompt body maps each tool to the question it answers:

```text
check_thresholds           → oversized files and functions
get_complexity_metrics     → deep nesting, many params, high cognitive complexity
get_code_smells            → TODO, FIXME, HACK, XXX, BUG, UNUSED, DEPRECATED markers and unsafe casts
get_functions detail=lines → per-function line counts
get_line_counts            → file line metrics (code/blank/comment)
get_code_inventory         → classes, functions, methods, and exports overview
get_documentation_coverage → undocumented functions/classes
get_prop_drilling          → parameter threading (prop drilling) across function chains
```

Two other rules the agent definition should include: after refactoring,
rerun the Scopewalker tool that flagged the violation to confirm it's
actually gone (don't trust the diff). And gate structural refactors on
existing or newly written characterization tests, since fixing threshold
violations usually means moving code around.

### docs-reality-sync

A documentation-audit agent gets the inventory tools so it can check docs
against the code instead of trusting the prose:

```markdown
---
name: docs-reality-sync
description: Audits all documentation against the actual codebase and
  fixes discrepancies in paths, tool names, parameters, npm scripts,
  versions, and code examples. Use after refactoring, feature
  additions/removals, or renames, or when documentation staleness is
  suspected.
model: opus
tools: Bash, Read, Edit, Write, Glob, Grep, WebFetch, WebSearch, mcp__scopewalker__get_code_inventory, mcp__scopewalker__get_functions, mcp__plugin_context7_context7__resolve-library-id, mcp__plugin_context7_context7__query-docs
---
```

With the inventory tools in its allowlist it can confirm documented
symbols actually exist. Its checklist should also cover: skill/agent
frontmatter `tools:` entries reference tools that exist, and documented
commands, defaults, and thresholds match the code.

### agents-md-enforcer

An agent that prunes `AGENTS.md` bloat pairs well with the
["Replacing derivable documentation"](#replacing-derivable-documentation)
pattern above. Content is safe to cut when agents can derive it with `ls`
or the inventory tools. From its rules:

```markdown
6. **Cut on sight**: anything derivable from reading the codebase,
   standard language/framework conventions, linter-replaceable style
   rules, platitudes ("write clean code"), file-by-file codebase
   descriptions, ...
```

## Permission settings

To let skills and subagents call the tools without permission prompts,
allowlist them in `.claude/settings.local.json` (or share the list via
`.claude/settings.json`):

```json
{
  "permissions": {
    "allow": [
      "mcp__scopewalker__check_thresholds",
      "mcp__scopewalker__get_code_inventory",
      "mcp__scopewalker__get_code_smells",
      "mcp__scopewalker__get_complexity_metrics",
      "mcp__scopewalker__get_documentation_coverage",
      "mcp__scopewalker__get_functions",
      "mcp__scopewalker__get_line_counts",
      "mcp__scopewalker__get_prop_drilling"
    ]
  }
}
```

The wildcard `"mcp__scopewalker__*"` (or the bare server name
`"mcp__scopewalker"`) covers all of the server's tools in one entry. Use
the explicit list above if you prefer per-tool review.

## Antigravity CLI agents

Antigravity CLI (which replaced Gemini CLI in June 2026) discovers
workspace agents at `.agents/agents/<name>.md` (global ones under
`~/.gemini/config/agents/`). The same agent bodies work; the frontmatter
differs. MCP access comes from the globally configured servers or a
per-agent `mcpServers` block, and `subagent: true` lets the primary agent
delegate to it:

```markdown
---
name: standards-enforcer
description: "Analyze the codebase for violations of project coding
  standards and refactor to fix them while keeping tests green."
subagent: true
mainAgent: false
---
```

Be careful with the optional `tools:` allowlist: an unmapped tool name can
hang the run, so omit it unless you need the restriction.

If you maintain both `.claude/` and `.agents/`, keep one copy of the
skill/agent bodies in a shared directory (e.g. `.shared/skills/`) and
reference or symlink it from each, rather than duplicating them.

## Conventions

A few things apply no matter which integration point you use:

- Always pass `extensions` matched to the project language(s), so runs
  stay fast and results stay relevant. Caveat: on the tokei-backed tools
  (`get_line_counts`, `check_thresholds`) an extension tokei doesn't
  recognize silently returns nothing (see `docs/known-bugs.md`).
- Every tool caps its result list at 20 entries by default. Fine for spot
  checks, but a repo-wide report needs a higher `limit` or the agent only
  ever sees the top 20 hits.
- Point pre-commit checks at the modified directories; save repo-wide
  sweeps for explicit, periodic runs.
- Point agents at `get_code_inventory` instead of hand-maintaining
  file/function lists that drift out of date.

This repo uses these patterns itself; see `.claude/skills/check-quality`,
`.claude/skills/polish`, `.claude/agents/standards-enforcer.md`, and
`.claude/agents/docs-reality-sync.md` for the real versions of the skill
and agent examples above.

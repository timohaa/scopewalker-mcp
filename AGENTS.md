# AGENTS.md

## What

MCP server providing codebase analysis tools for AI assistants. It is a thin orchestration layer over external parsing, file discovery, and line counting via `tokei`.

## How

```bash
npm run build          # Build
npm run check          # Version sync + lint + typecheck (run before committing)
npm run test           # Run tests
npm run test:coverage  # Tests with coverage
```

Use the project's own MCP tools to understand and validate code. Run `check_thresholds` before committing.

If LSP tools are available in your session, prefer them (`workspaceSymbol`, `findReferences`, `goToDefinition`, `hover`) over Grep/Read for code navigation; otherwise use Grep for text/pattern searches.

## Behavior

- For ambiguous requests, sketch a short plan and state assumptions and tradeoffs before editing.
- Write the minimum code that solves the problem. Avoid speculative abstractions, drive-by renames, and unrelated cleanup.
- Define a success criterion before starting and loop until it passes. Verify tool output with the tool itself or its tests; `npm run check` alone is insufficient.
- Pass every target file to one command (`npx vitest run a.test.ts b.test.ts`, `npx markdownlint f1 f2`, or one `grep -nE` across all files).
- **Never create `_enhanced`, `_v2`, or `_new` duplicate file variants**; edit the original file.

## Reference Docs

- [TOOLS.md](./TOOLS.md): tool reference
- [docs/](./docs/): detailed tool documentation; [docs/known-bugs.md](./docs/known-bugs.md) lists verified defects and gaps, check it before chasing unexpected tool output
- `.claude/skills/create-tool`, `.claude/skills/create-test`: workflows and code examples for adding tools/tests
- `/polish`, `/review-changes`: quality-pipeline slash commands (see `.claude/skills/` for the rest)
- `.claude/agents/`: specialized agents for standards, testing, docs, and code-quality enforcement (see directory for the full list)

## Codex Workflows

Codex entrypoints live in `.agents/skills/` and `.codex/agents/`.
They load the shared workflows in `.claude/`; edit those sources to update behavior.
Use `$create-tool`, `$create-test <file-path>`, `$review-changes [full]`, or `$polish [full]`.
Polish remains explicit-only. Ask for a specialized agent by its filename stem.
If new entrypoints do not appear, restart Codex in this repository.

Apply these adapters when following a shared Claude workflow in Codex:

- Treat Claude frontmatter (`model`, `tools`, `argument-hint`, `disable-model-invocation`) as source metadata. Codex entrypoints control invocation policy; agents inherit the session model and permissions.
- Use available shell, file-editing, and search tools for `Bash`, `Read`, `Write`, `Edit`, `Glob`, and `Grep`. Map Scopewalker tools by operation name, regardless of MCP server prefix. Use available documentation or web tools when Context7 is unavailable.
- Translate `/skill` invocations to `$skill`, preserving arguments such as `full`.
- Translate `Agent` and `subagent_type` into the available Codex delegation API. Select the matching custom agent when supported. Otherwise, pass its `.claude/agents/<name>.md` path and these adapters to a general subagent.
- Preserve pipeline order and waits. Run polish steps 4a/4b concurrently when supported. If delegation is unavailable, read each agent definition and run the steps sequentially; report that fallback.
- Resolve workflow commands and paths from this repository root. Read applicable nested `AGENTS.md` instructions before editing subprojects.
- Ask only for requirements missing from the task and repository context. Shared workflows do not override user instructions or authorize unrelated work.
- Include `.agents/skills/` and `.codex/agents/` in documentation audits. Verify entrypoint references as well as shared sources.
- When auditing instructions, distinguish Claude's `@path` imports from Codex's `AGENTS.md` discovery. Verify Codex behavior against official OpenAI documentation; preserve both clients' working entrypoints.

Discovery and configuration follow the official [skills](https://learn.chatgpt.com/docs/build-skills) and [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents) documentation.

## Writing Style

Applies to chat responses, commit messages, PR descriptions, and docs. Ban the rhetorical move, not just the phrase — restating it in new words is still banned.

- No antithesis filler ("it's not X, it's Y", "isn't just X, it's Y") — implies a distinction without stating one.
- No preamble that announces insight instead of giving it ("here's the thing", "the real question is", "worth noting", "to be clear", "let me be direct").
- No closing aphorisms ("that's the whole game", "that's the tell").
- No sentence fragments used for emphasis, no sentence that exists only for rhythm.
- No vague jargon standing in for a plain claim ("load-bearing", "surface area", "first-class", "at scale", "does the heavy lifting").
- Do not use "gate" or "gating" as generic verbs or metaphors. Reserve them for actual gates, such as physical, noise, or logic gates.
- No intensifiers propping up a claim that should stand on its own ("genuinely", "truly", "actually", "honestly").
- No rule-of-three or "two things:" list where an item is filler.
- Lead with the action, not the topic: "I'd skip the architecture doc," not "The architecture doc is the bit I'd skip."
- One idea per sentence; prefer sentences under ~20 words.

Examples:

- "Two honest caveats, because they are the actual insight." -> "Note that"
- "Watch what dissolves. Each piece of the current machinery becomes a line of ordinary code." -> "The current machinery simplifies to"

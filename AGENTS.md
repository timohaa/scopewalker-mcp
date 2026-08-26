# AGENTS.md

## What

MCP server providing codebase analysis tools for AI assistants. Thin orchestration layer over external parsing, line-counting (via the `tokei` binary), and file-discovery tools; see `package.json` for npm dependencies.

## Why

Gives AI coding agents quantitative visibility into codebases (complexity, prop drilling, documentation coverage, code smells) so they can make informed refactoring and review decisions.

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

- **Think before coding.** If a request is ambiguous, sketch a short plan and surface assumptions/tradeoffs before editing.
- **Minimum footprint.** Write the minimum code that solves the problem: no speculative abstractions, no drive-by renames, no unrelated cleanup bundled into the same change.
- **Verify, don't trust.** Define a success criterion before starting and loop until it's met. `npm run check` is necessary but not sufficient to confirm a tool's actual output; verify behavior with the tool itself or its tests.
- **Batch multi-file commands.** Pass every target file to one invocation (`npx vitest run a.test.ts b.test.ts`, `npx markdownlint f1 f2`, one `grep -nE` across all files) — never one Bash call per file.
- **Never create `_enhanced`, `_v2`, or `_new` duplicate file variants**; edit the original file.

## Reference Docs

- [TOOLS.md](./TOOLS.md): tool reference
- [docs/](./docs/): detailed tool documentation; [docs/known-bugs.md](./docs/known-bugs.md) lists verified defects and gaps, check it before chasing unexpected tool output
- `.claude/skills/create-tool`, `.claude/skills/create-test`: workflows and code examples for adding tools/tests
- `/polish`, `/review-changes`: quality-pipeline slash commands (see `.claude/skills/` for the rest)
- `.claude/agents/`: specialized agents for standards, testing, docs, and code-quality enforcement (see directory for the full list)

## Writing Style

Applies to chat responses, commit messages, PR descriptions, and docs. Ban the rhetorical move, not just the phrase — restating it in new words is still banned.

- No antithesis filler ("it's not X, it's Y", "isn't just X, it's Y") — implies a distinction without stating one.
- No preamble that announces insight instead of giving it ("here's the thing", "the real question is", "worth noting", "to be clear", "let me be direct").
- No closing aphorisms ("that's the whole game", "that's the tell").
- No sentence fragments used for emphasis, no sentence that exists only for rhythm.
- No vague jargon standing in for a plain claim ("load-bearing", "surface area", "first-class", "at scale", "does the heavy lifting").
- No intensifiers propping up a claim that should stand on its own ("genuinely", "truly", "actually", "honestly").
- No rule-of-three or "two things:" list where an item is filler.
- Lead with the action, not the topic: "I'd skip the architecture doc," not "The architecture doc is the bit I'd skip."
- One idea per sentence; prefer sentences under ~20 words.

Examples:

- "Two honest caveats, because they are the actual insight." -> "Note that"
- "Watch what dissolves. Each piece of the current machinery becomes a line of ordinary code." -> "The current machinery simplifies to"

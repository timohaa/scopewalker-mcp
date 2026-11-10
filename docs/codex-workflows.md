# Codex Workflows

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

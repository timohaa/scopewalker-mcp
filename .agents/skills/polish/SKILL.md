---
name: polish
description: "Run the quality fixer pipeline and require verified resolution of actionable findings. Defaults to changed source files; pass `full` for all source files."
---

# Polish

Read the repository [Codex workflow adapters](../../../AGENTS.md#codex-workflows),
then read and follow the shared [polish workflow](../../../.claude/skills/polish/SKILL.md).
Apply the adapters to Claude-specific instructions. Resolve workflow paths from
the repository root, including when invoked from a subdirectory.
Preserve arguments supplied with the invocation.

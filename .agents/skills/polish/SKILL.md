---
name: polish
description: "Run the full quality pipeline (lint/type/format fix, test fix, standards enforcement, comment cleanup, docs sync, AGENTS.md enforcement, and markdown lint) using subagents. Defaults to changed-files scope for comment cleanup; pass `full` for a whole-codebase sweep."
---

# Polish

Read the repository [Codex workflow adapters](../../../AGENTS.md#codex-workflows),
then read and follow the shared [polish workflow](../../../.claude/skills/polish/SKILL.md).
Apply the adapters to Claude-specific instructions. Resolve workflow paths from
the repository root, including when invoked from a subdirectory.
Preserve arguments supplied with the invocation.

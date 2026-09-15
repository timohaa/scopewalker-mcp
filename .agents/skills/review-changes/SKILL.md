---
name: review-changes
description: "Review uncommitted changes and fail on unresolved Scopewalker findings or repository checks. Pass `full` for a whole-source audit."
---

# Review Changes

Read the repository [Codex workflow adapters](../../../AGENTS.md#codex-workflows),
then read and follow the shared [review-changes workflow](../../../.claude/skills/review-changes/SKILL.md).
Apply the adapters to Claude-specific instructions. Resolve workflow paths from
the repository root, including when invoked from a subdirectory.
Preserve arguments supplied with the invocation.

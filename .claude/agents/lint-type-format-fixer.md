---
name: lint-type-format-fixer
description: Run lint, typecheck, and Prettier, then fix every reported problem. Use after code changes and before commits.
model: sonnet
tools: Bash, Read, Edit, Glob, Grep
---

# Lint Type Format Fixer

Run the TypeScript lint, type, and formatting checks, fix every reported problem,
and repeat until they pass.

```bash
npm run lint 2>&1
npm run typecheck 2>&1
npx prettier --check src 2>&1
```

Fix formatting first (`npm run format`), then type errors, then lint errors
(`npm run lint:fix`, then by hand). Re-run all three checks until they report
zero errors.

A `check:versions` failure (from `npm run check`) means `manifest.json` /
`server.json` versions are out of sync with `package.json`. Update the version
fields it names rather than touching source.

## Rules

- Never change behaviour to fix a lint error.
- If a fix needs significant refactoring, flag it for human review instead.

Report initial counts by category, files changed, actual final results
(including remaining failures), and anything needing human review.

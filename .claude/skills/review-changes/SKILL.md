---
name: review-changes
description: Review uncommitted changes against project standards. Use before committing or when asked to review the working tree.
---

# Review Changes

Review all uncommitted changes against project standards before committing.

## Workflow

### 1. Get changed files

```bash
git status --porcelain
```

Covers modified, staged, and untracked files — untracked new files
must be reviewed too, or the missing-tests/missing-docs checks below
can't catch them.

### 2. Review the diff

```bash
git diff
git diff --cached
```

### 3. Run automated checks

```bash
npm run check
npm run test
```

Use `check_thresholds` and `get_code_smells` on changed files.

### 4. Manual review

For each changed file, check for issues automation misses:

- `eslint-disable` or `@ts-ignore` added without justification
- `console.log` left in (use structured error handling)
- Commented-out dead code
- New functionality missing corresponding tests
- New/changed tools missing documentation updates in `TOOLS.md` and `docs/`

### 5. Report

List issues grouped by severity:

- **Must fix**: Standards violations, bugs, missing tests
- **Should fix**: Style issues, minor improvements
- **Consider**: Suggestions, optional improvements

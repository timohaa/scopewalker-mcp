---
name: check-quality
description: Run all code quality checks (lint, typecheck, format, tests, thresholds)
---

# Check Quality

Run the full quality gate for the project.

## Workflow

### 1. Run automated checks

Run these commands and capture output:

```bash
npm run check          # lint:fix + typecheck
npx prettier --check src
npm run test
```

### 2. Run scopewalker checks

Use MCP tools to validate code standards:

- `check_thresholds` on `src/` — verify files/functions are within size limits (defaults: 300 lines/file, 100 lines/function)
- `get_code_smells` on `src/` — review any TODO/FIXME/HACK markers

### 3. Report findings

For each issue found, report:

- **File and line** in `file:line` format
- **Category**: lint, type error, format, threshold violation, or code smell
- **Description**: what the issue is and how to fix it

### 4. Summary

End with a pass/fail summary:

- Lint: pass/fail (N issues)
- Types: pass/fail (N errors)
- Format: pass/fail (N files)
- Tests: pass/fail (N passed, N failed)
- Thresholds: pass/fail (N violations)

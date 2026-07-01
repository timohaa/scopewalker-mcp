---
name: run-tests
description: Run tests with options for filtering, watch mode, and coverage
---

# Run Tests

Run project tests using vitest.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run test` | Run all tests once |
| `npm run test:watch` | Run in watch mode |
| `npm run test:coverage` | Run with coverage report |
| `npx vitest run <file>` | Run a specific test file |
| `npx vitest run -t "test name"` | Run tests matching a name pattern |

## Workflow

1. **Identify scope**: Determine which tests to run based on user request
   - Specific file: `npx vitest run src/tools/lineCounts.test.ts`
   - Specific tool: `npx vitest run src/tools/codeSmells` (matches all codeSmells test files)
   - All tests: `npm run test`
2. **Run tests**: Execute the appropriate command
3. **Report results**: Summarize pass/fail counts and any failures
4. **On failure**: Read the failing test and relevant source to diagnose the issue

## Test Structure

- Tests live alongside source files: `src/tools/*.test.ts`, `src/lib/*.test.ts`, `src/utils/*.test.ts`
- Use `getToolHandler` from `src/testUtils/toolTestHarness.ts` for tool tests
- Mock external dependencies with `vi.mock()`
- Test both success and error scenarios

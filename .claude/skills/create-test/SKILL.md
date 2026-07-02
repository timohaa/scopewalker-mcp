---
name: create-test
description: Generate a vitest test file for an existing module following project testing patterns. Use when adding tests for a module that lacks them.
argument-hint: <file-path>
---

# Create Test

Generate tests for existing code following project conventions.

## Test File Layout

Tests live **alongside** the source file:

| Source                       | Test                              |
|------------------------------|-----------------------------------|
| `src/tools/<name>.ts`        | `src/tools/<name>.test.ts`        |
| `src/lib/<name>.ts`          | `src/lib/<name>.test.ts`          |
| `src/utils/<name>.ts`        | `src/utils/<name>.test.ts`        |
| `src/tools/<name>Helpers.ts` | `src/tools/<name>Helpers.test.ts` |

Variants (e.g., language-specific cases for a single tool) use a dotted
suffix: `documentationCoverage.languages.test.ts`.

Framework: **vitest** (`describe`, `it`, `expect`, `vi`).

## Workflow

1. **Read the source file** to understand what to test
2. **Identify test cases**:
   - Happy path scenarios
   - Edge cases (empty input, missing fields, large input)
   - Error handling (invalid args, file not found, parse errors)
   - Path-scoping behavior for tools that take a `path` parameter
3. **Choose the right harness**:
   - **Tools** (anything in `src/tools/` that registers via `register*Tool`)
     → use `getToolHandler` + `parseContent` from
     `src/testUtils/toolTestHarness.ts`
   - **Helpers / lib / utils** → import the function directly
4. **Create test file** following the patterns below
5. **Run tests** with the smallest scope:

   ```bash
   npx vitest run src/tools/<name>.test.ts
   ```

## Patterns

### Tool Test (uses MCP harness)

```typescript
import { mkdir, rm, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { MyToolResult } from "../types/index.js";
import { registerMyTool } from "./myTool.js";

describe("myTool", () => {
  let testDir: string;
  const handler = getToolHandler(registerMyTool, "my_tool");

  beforeAll(async () => {
    const tempPath = join(tmpdir(), `scopewalker-myTool-${String(Date.now())}`);
    await mkdir(tempPath, { recursive: true });
    testDir = await realpath(tempPath);

    await writeFile(join(testDir, "sample.ts"), `export const x = 1;\n`);
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("returns expected result for a valid path", async () => {
    const response = await handler({ path: testDir });
    const result = parseContent<MyToolResult>(response);

    expect(result.files).toHaveLength(1);
  });

  it("returns an error for a path outside allowed roots", async () => {
    const response = await handler({ path: "/etc" });

    expect(response.isError).toBe(true);
  });
});
```

### Helper / Pure-Function Test

```typescript
import { describe, it, expect } from "vitest";
import { myHelper } from "./myHelpers.js";

describe("myHelper", () => {
  it("returns the expected value", () => {
    expect(myHelper("input")).toBe("output");
  });

  it("handles empty input", () => {
    expect(myHelper("")).toBe("");
  });
});
```

## Conventions

- ESM imports — **always** include the `.js` extension (the project is
  `"type": "module"`)
- Use `vi.mock()` to stub external dependencies (`../lib/tokei.js`,
  filesystem boundaries)
- Use a unique temp directory per test (`tmpdir() + Date.now()`) and
  resolve it with `realpath` to avoid macOS `/private/var` vs `/var`
  symlink issues
- Test the **public** behavior of a module, not its internals
- Cover both success and error paths for every tool

After creating the test, run it once to confirm it passes, then run
`npm run check` to verify lint/types. If it fails for a non-obvious
reason, use the `smart-test-fixer` agent rather than guessing at fixes.

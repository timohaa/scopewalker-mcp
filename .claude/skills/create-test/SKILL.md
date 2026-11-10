---
name: create-test
description: Generate a vitest test file for an existing module following project testing patterns.
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

Name each test module for the behaviour it pins. When one module's tests
cover several behaviours, split them into files with a dotted behaviour
suffix: `documentationCoverage.languages.test.ts`, `tokei.errors.test.ts`.
`describe` and `it` titles state the behaviour, not the function name.

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
     `src/testUtils/toolTestHarness.ts`; `parseContent` reads the JSON
     text block, and `firstItem` returns the first element of a list or
     fails the test when it is empty (needed under `noUncheckedIndexedAccess`)
   - **Schema or roots behavior through a real client** → extend
     `src/server.outputSchema.test.ts` or `src/server.roots.test.ts`
   - **Helpers / lib / utils** → import the function directly
4. **Create test file** following the patterns below
5. **Run tests** with the smallest scope:

   ```bash
   npx vitest run src/tools/<name>.test.ts
   ```

## Patterns

### Tool Test (uses MCP harness)

Setup (temp dir, handler, `beforeAll`/`afterAll`) lives at module top
level; `describe` blocks only group the `it` cases. Import `vi` only
when the test mocks something.

```typescript
import { mkdir, rm, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { MyToolResult } from "../types/index.js";
import { registerMyTool } from "./myTool.js";

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

describe("myTool", () => {
  it("returns expected result for a valid path", async () => {
    const response = await handler({ path: testDir });
    const result = parseContent(response) as MyToolResult;

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

- ESM imports: **always** include the `.js` extension (the project is
  `"type": "module"`)
- Search `src/testUtils/` and neighbouring tests for an existing helper
  before writing one; extract shared setup instead of copying it
- Run the real `tokei` binary and real parsers; never mock a success
  payload. To inspect call arguments, wrap the real function in a spy
  (`vi.fn(actual.analyze)` inside `vi.mock` with `importOriginal`)
- Mock only to inject a fault the real tool cannot produce on demand (spawn
  error, timeout, oversized output). Prefer a real failure where one exists,
  such as `vi.stubEnv("PATH", "")` for a missing binary
- Tests read only files in the repo or files they create in their temp
  directory. No network or live services
- Every assertion must be able to fail. State expected values as literals;
  do not recompute them with the implementation's logic
- No `.skip`, `.todo`, `skipIf`, `retry`, or suppression comments. A missing
  binary, grammar, or fixture fails the test
- A test that passes only sometimes is a top-severity bug. Fix the cause
- Use a unique temp directory per test file (`tmpdir() + Date.now()`,
  created in `beforeAll`) and resolve it with `realpath` to avoid macOS
  `/private/var` vs `/var` symlink issues
- Test the **public** behavior of a module, not its internals
- Cover both success and error paths for every tool

After the targeted test run, run `npm run check` to verify lint/types.
Apply the test-change checks in [docs/code-quality.md](../../../docs/code-quality.md),
including size limits on test files and suite callbacks. Fix violations and rescan;
split tests by behavior when needed, without weakening assertions or hiding files from the scan.

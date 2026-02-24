# Tools Reference

Scopewalker MCP provides 8 tools for codebase analysis.

## Common Parameters

Most tools share these parameters:

| Name              | Type     | Description                                        |
|-------------------|----------|----------------------------------------------------|
| `path`            | string   | Path to file or directory (required)               |
| `include_hidden`  | boolean  | Include hidden files (default: false)              |
| `ignore_patterns` | string[] | Glob patterns to exclude                           |
| `extensions`      | string[] | Filter by file extensions (e.g., `[".ts", ".js"]`) |
| `max_depth`       | integer  | (When supported) Maximum directory depth to traverse|
| `max_files`       | integer  | (When supported) Maximum number of files to scan    |
| `grep`            | string   | (When supported) Filter results by keyword (case-insensitive substring match) |
| `limit`           | integer  | (When supported) Maximum number of items/files to return (default: 20; meaning varies by tool) |

### Grep Filtering

The `grep` parameter provides fast keyword filtering across results. It performs case-insensitive substring matching on:

- **File paths** - Files whose path contains the keyword are included with all their contents
- **Symbol names** - For tools with nested items (functions, classes), items matching the keyword are included

Example usage:

```json
{ "path": ".", "grep": "handler" }   // Find all files/symbols containing "handler"
{ "path": ".", "grep": "test" }      // Find test-related files and functions
```

Tools supporting grep: `get_line_counts`, `get_functions`, `get_code_inventory`

**Path scoping:** All tools resolve paths with `realpath` and will reject requests outside allowed roots. Defaults: current working directory and system temp. Override with `SCOPEWALKER_ALLOWED_ROOTS=/abs/path1,/abs/path2`.

**Default ignores:** File discovery skips common build artifacts, caches, and lock files (e.g., `node_modules`, `dist`, `package-lock.json`). Directory-scanning tools also respect `.gitignore`; tokei-based tools (`get_line_counts`, file-size checks in `check_thresholds`) do not read `.gitignore` and only use ignore lists.

**Resource guardrails:** AST-based tools skip files over 1 MB to prevent runaway memory/CPU usage. Tokei-based line counts do not enforce this limit. Use extension filters, `ignore_patterns`, and `limit` to reduce scan size further. Most directory-scanning tools also accept `max_depth` and `max_files` to bound traversal.

## Supported Languages

Function detection and parsing support:

| Language              | Detection                            |
|-----------------------|--------------------------------------|
| TypeScript/JavaScript | `function`, arrow functions, methods |
| Python                | `def`, `async def`                   |
| Go                    | `func`                               |
| Rust                  | `fn`                                 |
| Java                  | method declarations                  |
| C/C++                 | function definitions                 |
| Ruby                  | `def`                                |

## Error Codes

All tools return structured errors:

| Code                   | Description                               |
|------------------------|-------------------------------------------|
| `PATH_NOT_FOUND`       | Path does not exist                       |
| `NOT_A_DIRECTORY`      | Expected directory, got file              |
| `NOT_A_FILE`           | Expected file, got directory              |
| `PERMISSION_DENIED`    | Cannot read path                          |
| `UNSUPPORTED_LANGUAGE` | Cannot parse functions for this file type |
| `PARSE_ERROR`          | Failed to parse source file               |
| `TOOL_NOT_AVAILABLE`   | Requested tool is not registered or usable |
| `GIT_NOT_FOUND`        | Git executable not found (reserved)       |
| `NOT_A_GIT_REPO`       | Path is not inside a git repository (reserved) |

## Response Format

Responses are JSON-serialized in MCP content blocks. When item counts are available, an `_meta` block is included with:

- `item_count`: number of primary items (e.g., files, violations, functions)
- `response_size_chars`: serialized payload size
- `warning`: present when responses are large; use filters or `limit` to trim output

Examples omit `_meta` for brevity.

## Tool Categories

- [Core Analysis Tools](./tools-core.md) - Line counts, function counts
- [Codebase Health Tools](./tools-health.md) - Thresholds, inventory, complexity
- [Code Quality Tools](./tools-quality.md) - Documentation coverage, code smells, prop drilling

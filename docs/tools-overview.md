# Tools Reference

Scopewalker MCP provides 8 tools for codebase analysis.

## Common Parameters

Most tools share these parameters:

| Name              | Type     | Description                                                                                    |
|-------------------|----------|------------------------------------------------------------------------------------------------|
| `path`            | string   | Path to file or directory (required)                                                           |
| `include_hidden`  | boolean  | Include hidden files (default: false)                                                          |
| `ignore_patterns` | string[] | Glob patterns to exclude                                                                       |
| `extensions`      | string[] | Filter by file extensions (e.g., `[".ts", ".js"]`)                                             |
| `max_depth`       | integer  | (When supported) Maximum directory depth to traverse                                           |
| `max_files`       | integer  | (When supported) Maximum number of files to scan                                               |
| `grep`            | string   | (When supported) Filter results by keyword (case-insensitive substring match)                  |
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

**Default ignores:** File discovery skips common build artifacts, caches, and lock files (e.g., `node_modules`, `dist`, `package-lock.json`). Directory-scanning tools respect the single `.gitignore` at the scanned path via the `ignore` library — nested `.gitignore` files in subdirectories are not read, and neither is the repository root's when you scan a subdirectory (see [known-bugs.md](./known-bugs.md)); tokei-based tools (`get_line_counts`, file-size checks in `check_thresholds`) respect `.gitignore` through tokei's built-in ignore handling (which only applies inside a git repository) in addition to those explicit ignore lists.

**Resource guardrails:** AST-based tools skip files over 1 MB to prevent runaway memory/CPU usage. Tokei-based line counts do not enforce this limit. Use extension filters, `ignore_patterns`, and `limit` to reduce scan size further. Most directory-scanning tools also accept `max_depth` and `max_files` to bound traversal.

## Supported Languages

Function detection and parsing support:

| Language              | Extensions                                   | Detection                            |
|-----------------------|----------------------------------------------|--------------------------------------|
| TypeScript/JavaScript | `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` | `function`, arrow functions, methods |
| Python                | `.py`                                        | `def`, `async def`                   |
| Go                    | `.go`                                        | `func`, methods with receivers       |
| Rust                  | `.rs`                                        | `fn` (including `impl` methods)      |
| Java                  | `.java`                                      | method and constructor declarations  |
| C/C++                 | `.c`, `.h`, `.cpp`, `.cc`, `.cxx`, `.hpp`    | function definitions                 |
| Ruby                  | `.rb`                                        | `def`, `def self.<name>`             |

Files with any other extension are skipped by the AST-based tools. `get_line_counts` uses tokei instead, so it reports on every language tokei recognizes.

**Extension filtering on tokei-backed tools:** `get_line_counts` and `check_thresholds` translate `extensions` into tokei language names through a fixed table covering the languages listed above plus common others. An extension outside that table is passed to tokei verbatim and only matches when it happens to name a tokei language: `.zig` works, but `.tf` does not, because tokei calls that language HCL. A non-matching filter silently returns nothing rather than erroring.

## Error Codes

All tools return structured errors:

| Code                   | Description                                                                                  |
|------------------------|----------------------------------------------------------------------------------------------|
| `PATH_NOT_FOUND`       | Path does not exist                                                                          |
| `NOT_A_DIRECTORY`      | Expected directory, got file (reserved; every tool accepts both)                             |
| `NOT_A_FILE`           | Expected file, got directory (reserved; every tool accepts both)                             |
| `PERMISSION_DENIED`    | Cannot read path, or path is outside allowed roots                                           |
| `UNSUPPORTED_LANGUAGE` | Cannot parse this file type (reserved; unsupported files are currently skipped, not errored) |
| `PARSE_ERROR`          | Unexpected analysis failure (e.g., tokei output could not be parsed)                         |
| `TOOL_NOT_AVAILABLE`   | A required external CLI is missing (returned when tokei is not installed)                    |
| `GIT_NOT_FOUND`        | Git executable not found (reserved)                                                          |
| `NOT_A_GIT_REPO`       | Path is not inside a git repository (reserved)                                               |

## Response Format

Responses are JSON-serialized in MCP content blocks. When item counts are available, an `_meta` block is included with:

- `item_count`: number of primary items (e.g., files, violations, functions)
- `response_size_chars`: serialized payload size
- `warning`: present when responses are large; use filters or `limit` to trim output
- `funding`: a link to [ways to support development](https://buymeacoffee.com/thaanpaa); inert metadata, never part of the analysis data

Examples omit `_meta` for brevity.

## Tool Categories

- [Core Analysis Tools](./tools-core.md) - Line counts, function counts
- [Codebase Health Tools](./tools-health.md) - Thresholds, inventory, complexity
- [Code Quality Tools](./tools-quality.md) - Documentation coverage, code smells, prop drilling

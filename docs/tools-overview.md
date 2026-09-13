# Tools Reference

Scopewalker MCP provides 9 tools for codebase analysis.

## Common Parameters

Most tools share these parameters:

| Name              | Type     | Description                                                                                              |
|-------------------|----------|----------------------------------------------------------------------------------------------------------|
| `path`            | string   | Path to file or directory (required)                                                                     |
| `include_hidden`  | boolean  | Include hidden files (default: false)                                                                    |
| `ignore_patterns` | string[] | Glob patterns to exclude (max 100 entries, 512 characters each)                                          |
| `extensions`      | string[] | Filter by file extensions (e.g., `[".ts", ".js"]`) (max 100 entries)                                     |
| `max_depth`       | integer  | (When supported) Maximum directory depth to traverse (max 64)                                            |
| `max_files`       | integer  | (When supported) Maximum number of files to scan (max 10000)                                             |
| `grep`            | string   | (When supported) Filter results by keyword (case-insensitive substring match)                            |
| `limit`           | integer  | (When supported) Maximum number of items/files to return (default: 20; meaning varies by tool; max 5000) |

### Grep Filtering

The `grep` parameter provides fast keyword filtering across results. It performs case-insensitive substring matching on:

- **File paths** - Files whose path contains the keyword are included with all their contents
- **Symbol names** - For tools with nested items (functions, classes), items matching the keyword are included

Example usage:

```json
{ "path": ".", "grep": "handler" }
```

To find test-related files and functions:

```json
{ "path": ".", "grep": "test" }
```

Tools supporting grep: `get_line_counts`, `get_functions`, `get_code_inventory`

A file whose path matches the keyword keeps its full contents and unfiltered per-file
aggregate fields (`function_count`, item lists, and the like). A file whose path does not
match, but that has at least one matching item, keeps only the matching items, and its
per-file aggregate fields reflect that filtered set, not the file's true totals. Summary
totals are computed from the filtered results.

**Path scoping:** All tools resolve paths with `realpath` and will reject requests outside allowed roots. Defaults: current working directory and system temp. Override with `SCOPEWALKER_ALLOWED_ROOTS=/abs/path1,/abs/path2`.

**Default ignores:** File discovery skips common build artifacts, caches, and lock files. Examples include `node_modules`, `dist`, `vendor`, and `package-lock.json`. Directory-scanning tools respect the single `.gitignore` at the scanned path via the `ignore` library. Nested `.gitignore` files in subdirectories are not read, and neither is the repository root's when you scan a subdirectory (see [known-bugs.md](./known-bugs.md)). Tokei-based tools (`get_line_counts`, file-size checks in `check_thresholds`) also respect `.gitignore` through tokei's built-in ignore handling, which only applies inside a git repository.

**`extensions` and `ignore_patterns`:** `extensions` matching is case-insensitive on every tool, tokei-backed or not, so `[".TS"]` and `[".ts"]` find the same files. `ignore_patterns` is matched as a glob relative to the scanned path; a filesystem-absolute pattern or an unexpanded `~`-prefixed one is rejected at the schema level with a validation error explaining that it must be relative (e.g. `"vendor"` or `"**/vendor/**"`, not `"/Users/you/project/vendor"` or `"~/project/vendor"`), because it would otherwise silently exclude nothing.

**Resource guardrails:** AST-based tools skip files over 1 MB to limit memory and CPU use. Tokei-based line counts do not enforce this limit. Use extension filters and `ignore_patterns` to reduce scan size; `limit` trims the response after analysis. Most directory-scanning tools also accept `max_depth` and `max_files`. Directory scans do not follow symbolic links; a symlink to a file or directory inside the scanned path is skipped. This applies to every AST-based tool. `get_line_counts` and the file-size pass in `check_thresholds` use tokei, which already skips symlinks. Symbol-discovery walks stop beyond 500 nested AST levels in `get_code_inventory`, `get_complexity_metrics`, `get_documentation_coverage`, `get_functions`, and `get_prop_drilling`. Deeper functions are silently omitted, though complexity helpers can still inspect deeper subtrees (see [known-bugs.md](./known-bugs.md)). `get_line_counts` and `check_thresholds` stream tokei's output rather than buffering it: the subprocess is killed and returns a `PARSE_ERROR` if it runs past 30 seconds or its output passes 512 MB, and the error message names which limit was hit and suggests narrowing the scan with `extensions` or `ignore_patterns`. A parse or analysis failure skips that file while the scan continues.

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

**`.h` detection:** a `.h` file is parsed as C++ when its source contains syntax no C compiler accepts — a `class` or `namespace` declaration, a template (`template<`), an access specifier (`public:`/`private:`/`protected:`), `::`, `virtual`, `using namespace`, or `extern "C++"` — and as C otherwise.

**Extension filtering on tokei-backed tools:** `get_line_counts` and `check_thresholds` translate `extensions` into tokei language names through a fixed table covering the languages listed above plus common others. An extension outside that table is passed to tokei verbatim. It matches only when the extension also names a tokei language. For example, `.zig` works while `.tf` does not because tokei calls that language HCL. A non-matching filter returns an empty result without an error.

## Error Codes

All tools return structured errors:

| Code                   | Description                                                                                                       |
|------------------------|-------------------------------------------------------------------------------------------------------------------|
| `PATH_NOT_FOUND`       | Path does not exist                                                                                               |
| `NOT_A_DIRECTORY`      | Expected directory, got file (reserved; every tool accepts both)                                                  |
| `NOT_A_FILE`           | Expected file, got directory (reserved; every tool accepts both)                                                  |
| `PERMISSION_DENIED`    | Cannot read path, or path is outside allowed roots                                                                |
| `UNSUPPORTED_LANGUAGE` | Cannot parse this file type (reserved; unsupported files are currently skipped, not errored)                      |
| `PARSE_ERROR`          | Unexpected analysis failure (e.g., tokei output could not be parsed, or its 512 MB/30s streaming guards were hit) |
| `TOOL_NOT_AVAILABLE`   | A required external CLI is missing (returned when tokei is not installed)                                         |
| `GIT_NOT_FOUND`        | Git executable not found (reserved)                                                                               |
| `NOT_A_GIT_REPO`       | Path is not inside a git repository (reserved)                                                                    |

## Response Format

Responses are JSON-serialized in MCP content blocks. When item counts are available, an `_meta` block is included with:

- `item_count`: number of primary items (e.g., files, violations, functions)
- `response_size_chars`: serialized payload size
- `warning`: present when the serialized response exceeds 40,000 characters (`LARGE_RESPONSE_THRESHOLD`); use filters or `limit` to trim output
- `funding`: a link to [ways to support development](https://buymeacoffee.com/thaanpaa); inert metadata, never part of the analysis data

Examples omit `_meta` for brevity.

## Tool Categories

- [Core Analysis Tools](./tools-core.md) - Line counts, function counts
- [Codebase Health Tools](./tools-health.md) - Thresholds, inventory, complexity
- [Code Quality Tools](./tools-quality.md) - Documentation coverage, code smells, prop drilling, dead code

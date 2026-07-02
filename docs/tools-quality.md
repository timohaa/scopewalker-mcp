# Code Quality Tools

## get_documentation_coverage

Analyzes documentation coverage - identifies functions, classes, and methods missing docstrings or JSDoc comments.

**Parameters:**

| Name                  | Type     | Required | Description                                                        |
|-----------------------|----------|----------|--------------------------------------------------------------------|
| `path`                | string   | Yes      | Path to file or directory                                          |
| `include_hidden`      | boolean  | No       | Include hidden files                                               |
| `ignore_patterns`     | string[] | No       | Glob patterns to exclude                                           |
| `extensions`          | string[] | No       | Filter by extensions                                               |
| `max_depth`           | integer  | No       | Maximum directory depth to traverse                                |
| `max_files`           | integer  | No       | Maximum number of files to scan                                    |
| `require_param_docs`  | boolean  | No       | Reserved flag for parameter docs enforcement (accepted, no extra checks today) |
| `require_return_docs` | boolean  | No       | Reserved flag for return docs enforcement (accepted, no extra checks today)    |
| `min_lines`           | integer  | No       | Only check functions with at least this many lines (default: 1)    |
| `summary_only`        | boolean  | No       | Return only summary, no detailed item lists (default: false)       |
| `limit`               | integer  | No       | Max undocumented items to return (default: 20)                     |

**Documentation Detection:**

| Language              | Recognized Formats                      |
|-----------------------|-----------------------------------------|
| JavaScript/TypeScript | JSDoc (`/** */`), TSDoc                 |
| Python                | Docstrings (`"""`, `'''`)               |
| Go                    | Godoc comments (`//`)                   |
| Rust                  | Doc comments (`///`, `//!`)             |
| Java                  | Javadoc (`/** */`)                      |
| C/C++                 | JSDoc-style (`/** */`)                  |
| Ruby                  | Line comments (`#`)                     |

**Response:**

```json
{
  "path": "/path/to/target",
  "coverage": { "documented": 145, "undocumented": 32, "percentage": 81.9 },
  "undocumented_items": [
    { "path": "src/utils/parser.ts", "name": "parseConfig", "type": "function", "line": 45, "lines": 28 }
  ],
  "by_file": [
    { "path": "src/utils/parser.ts", "documented": 5, "undocumented": 3, "percentage": 62.5 }
  ],
  "summary": {
    "files_analyzed": 45,
    "total_symbols": 177,
    "fully_documented_files": 38,
    "zero_documentation_files": 2
  },
  "truncated": { "items": 50, "total": 120 }
}
```

`truncated` appears when undocumented items are limited (default limit: 20) and more items exist than returned.

**Example:**

```json
{
  "name": "get_documentation_coverage",
  "arguments": { "path": "./src", "min_lines": 10, "extensions": [".ts", ".py"] }
}
```

---

## get_code_smells

Detects code smells like TODO, FIXME, HACK, XXX, BUG, UNUSED, and DEPRECATED comments, plus unsafe casts in TypeScript/JavaScript.

**Note:** Comment-based smells use tree-sitter to scan actual comments, avoiding false positives from string literals and code. The `unsafe_cast` smell is detected via AST patterns in TypeScript/JavaScript.

**Parameters:**

| Name              | Type     | Required | Description                                      |
|-------------------|----------|----------|--------------------------------------------------|
| `path`            | string   | Yes      | Path to file or directory                        |
| `include_hidden`  | boolean  | No       | Include hidden files                             |
| `ignore_patterns` | string[] | No       | Glob patterns to exclude                         |
| `extensions`      | string[] | No       | Filter by extensions                             |
| `max_depth`       | integer  | No       | Maximum directory depth to traverse              |
| `max_files`       | integer  | No       | Maximum number of files to scan                  |
| `types`           | string[] | No       | Which smell types to detect (default: all)       |
| `limit`           | integer  | No       | Max files with smells to return (default: 20)    |
| `include_text`    | boolean  | No       | Include matching comment text (default: redacted)|

**Available Smell Types:** `todo`, `fixme`, `hack`, `xxx`, `bug`, `unused`, `deprecated`, `unsafe_cast`

**Output caps:** Results default to 20 files; each file returns at most 50 smells to prevent oversized responses.

**Response:**

```json
{
  "path": "/path/to/target",
  "is_directory": true,
  "files": [
    {
      "path": "src/utils/parser.ts",
      "smells": [
        { "path": "src/utils/parser.ts", "line": 45, "type": "todo", "text": "<redacted>" }
      ]
    }
  ],
  "summary": {
    "total_files_scanned": 50,
    "files_with_smells": 12,
    "total_smells": 28,
    "by_type": { "todo": 15, "fixme": 8, "hack": 3, "xxx": 2, "bug": 0, "unused": 0, "deprecated": 0, "unsafe_cast": 0 }
  }
}
```

**Privacy default:** Comment text is redacted unless `include_text` is set to `true`.
**Size guard:** Files over 1 MB are skipped to avoid expensive parsing.

**Example:**

```json
{
  "name": "get_code_smells",
  "arguments": { "path": "./src", "types": ["todo", "fixme", "hack"], "extensions": [".ts", ".tsx"] }
}
```

---

## get_prop_drilling

Detects parameter threading (prop drilling) by finding parameter names passed through chains of functions. High occurrence counts across many files indicate parameters that may be better managed via context, dependency injection, or module-level state.

**Parameters:**

| Name                | Type     | Required | Description                                                                            |
|---------------------|----------|----------|----------------------------------------------------------------------------------------|
| `path`              | string   | Yes      | Path to file or directory                                                              |
| `include_hidden`    | boolean  | No       | Include hidden files                                                                   |
| `ignore_patterns`   | string[] | No       | Glob patterns to exclude                                                               |
| `extensions`        | string[] | No       | Filter by file extensions                                                              |
| `max_depth`         | integer  | No       | Maximum directory depth to traverse                                                    |
| `max_files`         | integer  | No       | Maximum number of files to scan                                                        |
| `limit`             | integer  | No       | Maximum number of threaded parameters to return (default: 20)                          |
| `min_occurrences`   | integer  | No       | Minimum function occurrences to flag a parameter (default: 3)                          |
| `exclude_common`    | boolean  | No       | Exclude common parameter names like `id`, `key`, `className` (default: false)          |
| `summary_only`      | boolean  | No       | Return only summary without per-parameter details (default: false)                     |

**Risk Levels:** Each threaded parameter is assigned a risk level (`high`, `medium`, `low`) based on occurrence count and forwarding evidence.

**Note:** `summary.threaded_parameters_found` is the total number of threaded parameters found; `limit` only trims the returned `threaded_parameters` details.

**Response:**

```json
{
  "path": "/path/to/target",
  "is_directory": true,
  "threaded_parameters": [
    {
      "name": "userId",
      "occurrences": 12,
      "files": ["src/api/handler.ts", "src/services/auth.ts"],
      "functions": ["handleRequest", "processUser", "validateAccess"],
      "forwarding_evidence": 8,
      "risk": "high"
    }
  ],
  "summary": {
    "files_analyzed": 45,
    "total_parameters_scanned": 320,
    "threaded_parameters_found": 5,
    "highest_occurrence": { "name": "userId", "count": 12 }
  }
}
```

**Example:**

```json
{
  "name": "get_prop_drilling",
  "arguments": { "path": "./src", "min_occurrences": 5, "exclude_common": true }
}
```

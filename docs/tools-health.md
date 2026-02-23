# Codebase Health Tools

## check_thresholds

Identifies files and functions that exceed configurable size thresholds.

**Parameters:**

| Name                 | Type     | Required | Description                                         |
|----------------------|----------|----------|-----------------------------------------------------|
| `path`               | string   | Yes      | Path to file or directory                           |
| `max_file_lines`     | integer  | No       | Flag files exceeding this (default: 300)            |
| `max_function_lines` | integer  | No       | Flag functions exceeding this (default: 100)        |
| `include_hidden`     | boolean  | No       | Include hidden files                                |
| `ignore_patterns`    | string[] | No       | Glob patterns to exclude                            |
| `extensions`         | string[] | No       | Filter by extensions                                |
| `max_depth`          | integer  | No       | Maximum directory depth to traverse                 |
| `max_files`          | integer  | No       | Maximum number of files to scan for functions       |
| `limit`              | integer  | No       | Max violations to return per category (default: 20) |

**Response:**

```json
{
  "path": "/path/to/target",
  "thresholds": {
    "max_file_lines": 300,
    "max_function_lines": 100
  },
  "violations": {
    "oversized_files": [
      { "path": "src/legacy/bigModule.ts", "lines": 487, "exceeds_by": 187 }
    ],
    "oversized_functions": [
      { "path": "src/api/handler.ts", "function_name": "processRequest", "lines": 156, "exceeds_by": 56, "start_line": 45 }
    ]
  },
  "summary": {
    "files_checked": 150,
    "functions_checked": 420,
    "file_violations": 3,
    "function_violations": 12
  }
}
```

---

## get_code_inventory

Generates a comprehensive inventory of classes, methods, functions, and exports.

**Parameters:**

| Name              | Type     | Required | Description                                           |
|-------------------|----------|----------|-------------------------------------------------------|
| `path`            | string   | Yes      | Path to file or directory                             |
| `include_hidden`  | boolean  | No       | Include hidden files                                  |
| `ignore_patterns` | string[] | No       | Glob patterns to exclude                              |
| `extensions`      | string[] | No       | Filter by extensions                                  |
| `max_depth`       | integer  | No       | Maximum directory depth to traverse                   |
| `max_files`       | integer  | No       | Maximum number of files to scan                       |
| `include_private` | boolean  | No       | Include private/internal symbols (default: false)     |
| `group_by`        | string   | No       | Grouping method: `file`, `type`, or `directory` (default: `file`) |
| `limit`           | integer  | No       | Maximum number of files to return (default: 20)       |
| `grep`            | string   | No       | Filter results by keyword (case-insensitive substring match) |

**Supported Symbol Types:** Classes, Functions, Interfaces/Types, Enums, Constants (each item includes an `exported` flag)

Notes:

- Results are grouped by file; `group_by` is accepted for forward compatibility and currently returns file-grouped results.
- Each file returns at most 100 items to prevent oversized responses; `limit` trims the number of files.

**Response:**

```json
{
  "path": "/path/to/target",
  "inventory": [
    {
      "file": "src/services/auth.ts",
      "items": [
        { "name": "AuthService", "type": "class", "line": 15, "exported": true,
          "methods": [{ "name": "login", "line": 25, "visibility": "public" }] },
        { "name": "createAuthContext", "type": "function", "line": 120, "exported": true }
      ]
    }
  ],
  "summary": {
    "total_files": 45,
    "total_classes": 23,
    "total_functions": 156,
    "total_methods": 82,
    "exported_symbols": 140
  }
}
```

---

## get_complexity_metrics

Returns code complexity metrics to identify code that may need refactoring.

**Parameters:**

| Name              | Type     | Required | Description                                              |
|-------------------|----------|----------|----------------------------------------------------------|
| `path`            | string   | Yes      | Path to file or directory                                |
| `include_hidden`  | boolean  | No       | Include hidden files                                     |
| `ignore_patterns` | string[] | No       | Glob patterns to exclude                                 |
| `extensions`      | string[] | No       | Filter by extensions                                     |
| `max_depth`       | integer  | No       | Maximum directory depth to traverse                      |
| `max_files`       | integer  | No       | Maximum number of files to scan                          |
| `metrics`         | string[] | No       | Which metrics to calculate (default: all)                |
| `summary_only`    | boolean  | No       | Return only summary, no per-file details (default: false)|
| `limit`           | integer  | No       | Max files to return, sorted by complexity (default: 20)  |

Note: All metrics are currently calculated; the `metrics` parameter is accepted for forward compatibility.

**Available Metrics:**

- `nesting_depth`: Maximum nesting level (loops, conditionals, callbacks)
- `parameters`: Function parameter counts
- `dependencies`: Import/require count per file
- `cognitive`: Simplified cognitive complexity score

**Response:**

```json
{
  "path": "/path/to/target",
  "files": [
    {
      "path": "src/utils/parser.ts",
      "metrics": {
        "max_nesting_depth": 6, "avg_nesting_depth": 2.3,
        "max_parameters": 8, "avg_parameters": 2.1,
        "dependency_count": 12, "cognitive_complexity": 45
      },
      "hotspots": [
        {
          "function": "parseNestedConfig",
          "line": 89,
          "issue": "nesting_depth",
          "value": 6,
          "recommendation": "Consider extracting nested logic into helper functions"
        }
      ]
    }
  ],
  "summary": {
    "files_analyzed": 50,
    "high_complexity_files": 5,
    "total_hotspots": 12,
    "most_complex_file": { "path": "src/utils/parser.ts", "cognitive_complexity": 45 }
  }
}
```

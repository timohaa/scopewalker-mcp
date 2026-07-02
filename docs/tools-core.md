# Core Analysis Tools

## get_line_counts

Returns line count metrics for files in a directory tree or a single file. Uses [tokei](https://github.com/XAMPPRocky/tokei) for accurate counting.

**Parameters:**

| Name              | Type     | Required | Description                                                       |
|-------------------|----------|----------|-------------------------------------------------------------------|
| `path`            | string   | Yes      | Path to file or directory                                         |
| `include_hidden`  | boolean  | No       | Include hidden files                                              |
| `ignore_patterns` | string[] | No       | Glob patterns to exclude                                          |
| `extensions`      | string[] | No       | Filter by extensions                                              |
| `sort_by`         | string   | No       | `"lines_desc"`, `"lines_asc"`, `"name"` (default: `"lines_desc"`) |
| `limit`           | integer  | No       | Maximum number of files to return (default: 20)                   |
| `grep`            | string   | No       | Filter results by keyword (case-insensitive substring match)      |

**Line Types:**

- `total`: All lines including blank and comments
- `code`: Non-blank, non-comment lines
- `blank`: Lines containing only whitespace
- `comment`: Lines that are purely comments (language-aware)

**Response:**

```json
{
  "path": "/path/to/target",
  "is_directory": true,
  "files": [
    {
      "path": "src/index.ts",
      "lines": {
        "total": 150,
        "code": 120,
        "blank": 20,
        "comment": 10
      }
    }
  ],
  "summary": {
    "total_files": 15,
    "total_lines": 2500,
    "total_code_lines": 2000,
    "total_blank_lines": 300,
    "total_comment_lines": 200
  }
}
```

**Example:**

```json
{
  "name": "get_line_counts",
  "arguments": {
    "path": "./src",
    "extensions": [".ts", ".tsx"],
    "sort_by": "lines_desc"
  }
}
```

---

## get_functions

Returns function/method information. Use `detail` parameter to control output level.

**Parameters:**

| Name              | Type     | Required | Description                                                                          |
|-------------------|----------|----------|--------------------------------------------------------------------------------------|
| `path`            | string   | Yes      | Path to file or directory                                                            |
| `detail`          | string   | No       | `"counts"` for function counts per file, `"lines"` for per-function line metrics (default: `"counts"`) |
| `include_hidden`  | boolean  | No       | Include hidden files                                                                 |
| `ignore_patterns` | string[] | No       | Glob patterns to exclude                                                             |
| `extensions`      | string[] | No       | Filter by extensions                                                                 |
| `max_depth`       | integer  | No       | Maximum directory depth to traverse                                                  |
| `max_files`       | integer  | No       | Maximum number of files to scan                                                      |
| `min_lines`       | integer  | No       | Only include functions with at least this many lines (lines mode only)               |
| `sort_by`         | string   | No       | `"count_desc"`, `"count_asc"`, `"lines_desc"`, `"lines_asc"`, `"name"`. Defaults: `"count_desc"` (counts mode), `"lines_desc"` (lines mode). `count_*` keys apply to counts mode and `lines_*` keys to lines mode; a key from the other mode falls back to that mode's default. |
| `limit`           | integer  | No       | Maximum number of files to return (default: 20)                                       |
| `grep`            | string   | No       | Filter by keyword                                                                    |

**Note:** Each file returns at most 100 functions to prevent oversized responses.

**Response (detail: counts):**

```json
{
  "path": "/path/to/target",
  "is_directory": true,
  "files": [
    {
      "path": "src/utils.ts",
      "language": "typescript",
      "function_count": 12,
      "functions": [
        { "name": "parseConfig", "line": 15 },
        { "name": "validateInput", "line": 45 }
      ]
    }
  ],
  "summary": {
    "total_files_analyzed": 10,
    "total_functions": 87,
    "files_with_no_functions": 2
  }
}
```

**Response (detail: lines):**

```json
{
  "path": "/path/to/target",
  "is_directory": true,
  "files": [
    {
      "path": "src/api.ts",
      "language": "typescript",
      "functions": [
        {
          "name": "handleRequest",
          "start_line": 25,
          "end_line": 89,
          "lines": {
            "total": 65,
            "code": 52,
            "blank": 8,
            "comment": 5
          }
        }
      ]
    }
  ],
  "summary": {
    "total_functions": 45,
    "average_lines_per_function": 28,
    "largest_function": {
      "name": "processData",
      "file": "src/processor.ts",
      "lines": 245
    },
    "functions_over_50_lines": 8
  }
}
```

**Example:**

```json
{
  "name": "get_functions",
  "arguments": {
    "path": "./src",
    "detail": "lines",
    "min_lines": 50,
    "sort_by": "lines_desc"
  }
}
```

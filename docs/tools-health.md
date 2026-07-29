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
| `max_depth`          | integer  | No       | Maximum directory depth for the function scan       |
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

| Name              | Type     | Required | Description                                                       |
|-------------------|----------|----------|-------------------------------------------------------------------|
| `path`            | string   | Yes      | Path to file or directory                                         |
| `include_hidden`  | boolean  | No       | Include hidden files                                              |
| `ignore_patterns` | string[] | No       | Glob patterns to exclude                                          |
| `extensions`      | string[] | No       | Filter by extensions                                              |
| `max_depth`       | integer  | No       | Maximum directory depth to traverse                               |
| `max_files`       | integer  | No       | Maximum number of files to scan                                   |
| `include_private` | boolean  | No       | Include private/internal symbols (default: false)                 |
| `group_by`        | string   | No       | Grouping method: `file`, `type`, or `directory` (default: `file`) |
| `limit`           | integer  | No       | Maximum number of files to return (default: 20)                   |
| `grep`            | string   | No       | Filter results by keyword (case-insensitive substring match)      |

**Supported Symbol Types:** Classes, Functions, Interfaces/Types, Enums, Constants (each item includes an `exported` flag)

Each language's declarations map onto those five types:

| Language              | Class             | Interface                       | Enum   | Function                                      | Constant                  |
|-----------------------|-------------------|---------------------------------|--------|-----------------------------------------------|---------------------------|
| TypeScript/JavaScript | `class`           | `interface`, `type`             | `enum` | `function`, `const`/`let` bound to a function | other `const`/`let`/`var` |
| Python                | `class`           | —                               | —      | module-level `def`                            | —                         |
| Go                    | `struct` types    | `interface` types, type aliases | —      | `func`                                        | —                         |
| Rust                  | `struct`          | `trait`                         | `enum` | `fn`                                          | —                         |
| Java                  | `class`           | `interface`                     | `enum` | —                                             | —                         |
| C/C++                 | `class`, `struct` | —                               | `enum` | function definitions                          | —                         |
| Ruby                  | `class`           | —                               | —      | top-level `def`                               | —                         |

Notes:

- Results are grouped by file; `group_by` is accepted for forward compatibility and currently returns file-grouped results.
- Each file returns at most 100 items to prevent oversized responses; `limit` trims the number of files. Files with no matching items are omitted from `inventory` entirely.
- Methods are nested under the class they belong to, not repeated as top-level functions. Go methods are matched to their type by receiver (`func (p *Point) Scale()`), but only within the same file — a method whose receiver type is declared in another file of the package is omitted from the inventory. C/C++ member functions are picked up from the record body, including declaration-only members. Rust `impl` methods are currently reported as standalone functions.
- `exported` follows each language's own convention: the TS/JS `export` keyword, module scope in Python, an initial uppercase letter in Go, and a bare `pub` in Rust. `pub(crate)` and `pub(super)` stop at the crate boundary and so count as unexported. Java, C/C++, and Ruby have no equivalent marker and always report `exported: false`.
- `include_private` filters on naming and visibility conventions: a leading underscore, an explicit `private` modifier in TypeScript, or a lowercase initial in Go. Because unexported is Go's only form of private, the default view of a Go package is its exported API surface; pass `include_private: true` for the rest. Rust visibility is reported but not filtered — non-`pub` items still appear, marked `exported: false`.

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

| Name              | Type     | Required | Description                                               |
|-------------------|----------|----------|-----------------------------------------------------------|
| `path`            | string   | Yes      | Path to file or directory                                 |
| `include_hidden`  | boolean  | No       | Include hidden files                                      |
| `ignore_patterns` | string[] | No       | Glob patterns to exclude                                  |
| `extensions`      | string[] | No       | Filter by extensions                                      |
| `max_depth`       | integer  | No       | Maximum directory depth to traverse                       |
| `max_files`       | integer  | No       | Maximum number of files to scan                           |
| `metrics`         | string[] | No       | Which metrics to calculate (default: all)                 |
| `summary_only`    | boolean  | No       | Return only summary, no per-file details (default: false) |
| `limit`           | integer  | No       | Max files to return, sorted by complexity (default: 20)   |

Note: All metrics are currently calculated; the `metrics` parameter is accepted for forward compatibility.

**Available Metrics:**

- `nesting_depth`: Maximum nesting level (loops, conditionals, callbacks). `else if` chains count as sibling branches, not extra nesting, in every supported language
- `parameters`: Function parameter counts; also counts props passed to React/JSX components (PascalCase elements) so heavily-propped components surface alongside high-arity functions
- `dependencies`: Import/require count per file
- `cognitive`: Simplified cognitive complexity score

Parameter counting is language-aware: Python skips `self`/`cls`, `*args`, `**kwargs`, and the bare `*` keyword-only marker; Go excludes the method receiver and expands grouped declarations (`func f(a, b, c int)` counts as 3); C/C++ parameter lists are read out of the function declarator.

Nesting and cognitive complexity likewise follow each grammar's own shape, but each runs off its own node list, so a construct can count toward one metric, both, or neither:

- **Both metrics:** `if`, `for`, and `while` in every grammar; switches everywhere (`switch_statement` in C, C++, TypeScript, and JavaScript, `expression_switch_statement` and `type_switch_statement` in Go, `switch_expression` in Java); Rust's expression forms (`if`/`for`/`while`/`loop`/`match` and closures); Ruby's keyword-named `if`, `unless`, `while`, `until`, `for`, and `case`.
- **Nesting only:** `try` blocks, the anonymous-function nodes TS/JS arrow functions and Java/C++ lambdas emit, and Ruby's `begin` and `do` blocks.
- **Cognitive complexity only:** `catch` clauses (Python's `except` is a different node and does not count), Ruby `rescue`, logical `&&`/`||` operators (Python's `and`/`or` do not count), the ternary node C, C++, and Python emit (TypeScript's and Java's ternary counts toward neither), and the `elif`/`elsif` nodes Python and Ruby give else-if chains. Because Python attaches `elif` flat to the parent `if` while other grammars nest them, a Python chain of three or more branches scores slightly lower than the same chain elsewhere.

Ruby brace blocks (`{ |x| ... }`), Python `lambda`, and Go function literals count toward neither metric.

Each hotspot's `issue` field is one of `nesting_depth`, `parameters`, or `jsx_props` (a JSX component receiving more than 5 props).

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

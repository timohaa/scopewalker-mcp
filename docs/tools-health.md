# Codebase Health Tools

## check_thresholds

Identifies files and functions that exceed configurable size thresholds.

**Parameters:**

| Name                 | Type     | Required | Description                                                   |
|----------------------|----------|----------|---------------------------------------------------------------|
| `path`               | string   | Yes      | Path to file or directory                                     |
| `max_file_lines`     | integer  | No       | Flag files exceeding this (default: 300)                      |
| `max_function_lines` | integer  | No       | Flag functions exceeding this (default: 100)                  |
| `include_hidden`     | boolean  | No       | Include hidden files                                          |
| `ignore_patterns`    | string[] | No       | Glob patterns to exclude                                      |
| `extensions`         | string[] | No       | Filter by extensions                                          |
| `max_depth`          | integer  | No       | Maximum directory depth for the function scan (max 64)        |
| `max_files`          | integer  | No       | Maximum number of files to scan for functions (max 10000)     |
| `limit`              | integer  | No       | Max violations to return per category (default: 20, max 5000) |

**Response:**

```json
{
  "path": "/path/to/target",
  "thresholds": {
    "max_file_lines": 300,
    "max_function_lines": 100
  },
  "violations": {
    "oversized_files": [{ "path": "src/legacy/bigModule.ts", "lines": 487, "exceeds_by": 187 }],
    "oversized_functions": [
      {
        "path": "src/api/handler.ts",
        "function_name": "processRequest",
        "lines": 156,
        "exceeds_by": 56,
        "start_line": 45
      }
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

| Name              | Type     | Required | Description                                                  |
|-------------------|----------|----------|--------------------------------------------------------------|
| `path`            | string   | Yes      | Path to file or directory                                    |
| `include_hidden`  | boolean  | No       | Include hidden files                                         |
| `ignore_patterns` | string[] | No       | Glob patterns to exclude                                     |
| `extensions`      | string[] | No       | Filter by extensions                                         |
| `max_depth`       | integer  | No       | Maximum directory depth to traverse (max 64)                 |
| `max_files`       | integer  | No       | Maximum number of files to scan (max 10000)                  |
| `include_private` | boolean  | No       | Include private/internal symbols (default: false)            |
| `limit`           | integer  | No       | Maximum number of files to return (default: 20, max 5000)    |
| `grep`            | string   | No       | Filter results by keyword (case-insensitive substring match) |

**Supported Symbol Types:** Classes, Functions, Interfaces/Types, Enums, Constants (each item includes an `exported` flag)

Each language's declarations map onto those five types:

| Language              | Class             | Interface                       | Enum   | Function                                      | Constant                  |
|-----------------------|-------------------|---------------------------------|--------|-----------------------------------------------|---------------------------|
| TypeScript/JavaScript | `class`           | `interface`, `type`             | `enum` | `function`, `const`/`let` bound to a function | other `const`/`let`/`var` |
| Python                | `class`           | -                               | -      | module-level `def`                            | -                         |
| Go                    | `struct` types    | `interface` types, type aliases | -      | `func`                                        | -                         |
| Rust                  | `struct`          | `trait`                         | `enum` | `fn`                                          | -                         |
| Java                  | `class`           | `interface`                     | `enum` | -                                             | -                         |
| C/C++                 | `class`, `struct` | -                               | `enum` | function definitions                          | -                         |
| Ruby                  | `class`           | -                               | -      | top-level `def`                               | -                         |

Notes:

- Results are grouped by file.
- Each file returns at most 100 items. The `limit` parameter trims the number of files. Files with no matching items are omitted from `inventory`.
- Methods are nested under their class and omitted from the top-level function list. Go methods match their type by receiver across every file in the package. A type in `types.go` can therefore collect methods from `methods.go`. Matching stays within each directory, which separates same-named types in different packages. C/C++ member functions are picked up from the record body, including declaration-only members. Rust `impl` methods are currently reported as standalone functions.
- `exported` follows each language's convention. It recognizes TS/JS `export`, Python module scope, Go capitalization, bare Rust `pub`, and Java `public`. Rust `pub(crate)` and `pub(super)` count as unexported. C/C++ and Ruby always report `exported: false` because they lack an equivalent declaration marker.
- `include_private` recognizes leading underscores, lowercase Go names, and explicit access modifiers. Because unexported is Go's only form of private, the default view of a Go package is its exported API. Pass `include_private: true` for the rest. Rust visibility is reported but not filtered. Non-`pub` Rust items still appear with `exported: false`.
- Nested method visibility comes from language-specific syntax. TypeScript and Java use declaration modifiers. C++ and Ruby use sections that govern members until the next marker. Ruby's `private :sym` and `private def x` forms are also recognized. A C++ `class` defaults to private, while a `struct` defaults to public. A Java method with no modifier is package-private, which the tool reports as `private` because it is not part of the type's outside-facing API. `protected` is reported as itself and survives `include_private: false`, being part of the inheritable API. Underscore-prefixed names remain private regardless of their section.

**Response:**

```json
{
  "path": "/path/to/target",
  "inventory": [
    {
      "file": "src/services/auth.ts",
      "items": [
        {
          "name": "AuthService",
          "type": "class",
          "line": 15,
          "exported": true,
          "methods": [{ "name": "login", "line": 25, "visibility": "public" }]
        },
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

| Name              | Type     | Required | Description                                                       |
|-------------------|----------|----------|-------------------------------------------------------------------|
| `path`            | string   | Yes      | Path to file or directory                                         |
| `include_hidden`  | boolean  | No       | Include hidden files                                              |
| `ignore_patterns` | string[] | No       | Glob patterns to exclude                                          |
| `extensions`      | string[] | No       | Filter by extensions                                              |
| `max_depth`       | integer  | No       | Maximum directory depth to traverse (max 64)                      |
| `max_files`       | integer  | No       | Maximum number of files to scan (max 10000)                       |
| `summary_only`    | boolean  | No       | Return only summary, no per-file details (default: false)         |
| `limit`           | integer  | No       | Max files to return, sorted by complexity (default: 20, max 5000) |

**Metrics Returned:** every run computes all of them; there is no metric selector.

- `max_nesting_depth` / `avg_nesting_depth`: nesting level (loops, conditionals, callbacks). The average includes positive subtree-depth measurements from visited AST nodes. `else if` chains count as sibling branches, not extra nesting, in every supported language
- `max_parameters` / `avg_parameters`: function parameter counts; also counts props passed to React/JSX components (PascalCase elements). The average includes both supported function parameter counts and component prop counts
- `dependency_count`: import/require count per file
- `cognitive_complexity`: simplified cognitive complexity, summed over the whole file
- `function_count`: function nodes measured, the denominator for `avg_cyclomatic_complexity`
- `max_cyclomatic_complexity` / `avg_cyclomatic_complexity`: classic McCabe, per function
- `max_cognitive_complexity`: the worst single function's cognitive score

`cognitive_complexity` and `max_cognitive_complexity` measure different scopes: the first is the whole-file sum, so it partly tracks file length, while the second reports the worst function. A file of many simple functions scores high on the first and low on the second.

**Per-function reporting:** The `functions` array lists functions whose cyclomatic complexity exceeds 10. Results are ordered worst first and capped at 10 per file. Severity follows radon's bands: `high` above 10 and `extreme` above 30. Files without a qualifying function return an empty array. `summary.high_complexity_functions` and `summary.most_complex_function` count every function analyzed, ignoring both the per-file cap and `limit`.

Cyclomatic complexity is 1 plus the decision points in a function. Decision points include conditionals, loops, exception handlers, ternaries, individual `switch`/`when`/`match` arms, and each logical operator. Unlike cognitive complexity it applies no nesting weight, so three nested `if`s score the same as three sequential ones. Each `else if` counts as the predicate it is. A `default`/`else`/`_` arm adds nothing, and anonymous functions are not branches.

The rules are uniform across all nine grammars rather than matching radon exactly. Radon additionally charges for Python's `with`, `assert`, and comprehensions, which have no detectable counterpart in the other eight languages. Counting them would make the same algorithm score higher in Python than in TypeScript. Expect scopewalker's Python numbers to sit slightly below radon's for code using those constructs.

Parameter counting follows each grammar. Python skips `self`/`cls`, `*args`, `**kwargs`, and the bare `*` keyword-only marker. Go excludes the method receiver and expands grouped declarations, so `func f(a, b, c int)` counts as 3. C/C++ parameter lists are read out of the function declarator.

Nesting and cognitive complexity use separate node lists for each grammar. A construct can count toward either metric, both, or neither:

- **Both metrics:** `if`, `for`, and `while` in every grammar, including the less common loop spellings (`do`-`while` in TypeScript, JavaScript, Java, C, and C++, Java's for-each, C++ range-for). Switches everywhere: `switch_statement` in C, C++, TypeScript, and JavaScript, `expression_switch_statement` and `type_switch_statement` in Go, `switch_expression` in Java. Rust's expression forms (`if`/`for`/`while`/`loop`/`match` and closures). Ruby's keyword-named `if`, `unless`, `while`, `until`, `for`, `case`, and `case ... in`.
- **Nesting only:** `try` blocks, anonymous functions in every grammar (`arrow_function` in TypeScript and JavaScript, `lambda` in Python and Ruby's stabby `->(x){}`, `func_literal` in Go, `lambda_expression` in Java and C++), and Ruby's `begin` plus both of its block forms. A lambda's own body is not an extra level: `->(x) { ... }` nests one deep, the same as the arrow function it corresponds to.
- **Cognitive complexity only:** `catch` clauses in every grammar that has one (`catch_clause` in TypeScript, JavaScript, Java, and C++, `except_clause` in Python, `rescue` in Ruby). Ternaries in every grammar that has one (`ternary_expression` in TypeScript, JavaScript, and Java, `conditional_expression` in Python, C, and C++, `conditional` in Ruby; Go and Rust have no ternary operator). Logical operators, both the `&&`/`||` form and the `and`/`or` keywords Python and Ruby also accept. The `elif`/`elsif` nodes Python and Ruby give else-if chains. An else-if branch scores a flat 1 whatever its grammar calls it, so a chain of three branches costs 3 in every supported language. Ruby's statement modifiers (`b if a`, `c while x`, `g rescue nil`) also land here: they are branches, but with no block there is nothing to nest.

Cyclomatic complexity runs off a third list and diverges from the other two in three ways. It counts each `switch` arm individually rather than charging once for the container (`switch_case` in TypeScript and JavaScript, `expression_case` and `type_case` in Go, `match_arm` in Rust, `switch_label` in Java, `case_statement` in C and C++, `case_clause` in Python, `when` and `in_clause` in Ruby), so a twelve-case switch scores 13 where cognitive complexity scores 1. It excludes anonymous functions entirely. It counts `else if` rather than flattening it.

Ruby's iterator blocks (`xs.each do ... end` and `xs.each { |x| ... }`) count toward nesting but toward neither cognitive nor cyclomatic complexity. Both forms parse identically to any other block-taking call, so `x.tap do ... end` has the same shape and a loop cannot be told apart from a non-loop. Nesting can count them anyway because a block is a level of indentation either way; a branch count cannot. See [known-bugs.md](./known-bugs.md).

Each hotspot's `issue` is `nesting_depth`, `parameters`, or `jsx_props`. The last value marks a JSX component with more than five props. The `functions` array reports cyclomatic and cognitive scores.

**Response:**

```json
{
  "path": "/path/to/target",
  "files": [
    {
      "path": "src/utils/parser.ts",
      "metrics": {
        "max_nesting_depth": 6,
        "avg_nesting_depth": 2.3,
        "max_parameters": 8,
        "avg_parameters": 2.1,
        "dependency_count": 12,
        "cognitive_complexity": 45,
        "function_count": 9,
        "max_cyclomatic_complexity": 14,
        "avg_cyclomatic_complexity": 4.2,
        "max_cognitive_complexity": 21
      },
      "functions": [
        {
          "name": "parseNestedConfig",
          "line": 89,
          "cyclomatic_complexity": 14,
          "cognitive_complexity": 21,
          "nesting_depth": 6,
          "severity": "high"
        }
      ],
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
    "high_complexity_functions": 7,
    "total_hotspots": 12,
    "most_complex_file": { "path": "src/utils/parser.ts", "cognitive_complexity": 45 },
    "most_complex_function": {
      "path": "src/utils/parser.ts",
      "function": "parseNestedConfig",
      "line": 89,
      "cyclomatic_complexity": 14
    }
  }
}
```

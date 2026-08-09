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

| Name              | Type     | Required | Description                                                  |
|-------------------|----------|----------|--------------------------------------------------------------|
| `path`            | string   | Yes      | Path to file or directory                                    |
| `include_hidden`  | boolean  | No       | Include hidden files                                         |
| `ignore_patterns` | string[] | No       | Glob patterns to exclude                                     |
| `extensions`      | string[] | No       | Filter by extensions                                         |
| `max_depth`       | integer  | No       | Maximum directory depth to traverse                          |
| `max_files`       | integer  | No       | Maximum number of files to scan                              |
| `include_private` | boolean  | No       | Include private/internal symbols (default: false)            |
| `limit`           | integer  | No       | Maximum number of files to return (default: 20)              |
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
- Each file returns at most 100 items to prevent oversized responses; `limit` trims the number of files. Files with no matching items are omitted from `inventory` entirely.
- Methods are nested under the class they belong to, not repeated as top-level functions. Go methods are matched to their type by receiver (`func (p *Point) Scale()`) across every file in the package, so a type declared in `types.go` still collects methods declared in `methods.go`. Matching is scoped to the directory, so same-named types in different packages stay separate. C/C++ member functions are picked up from the record body, including declaration-only members. Rust `impl` methods are currently reported as standalone functions.
- `exported` follows each language's own convention: the TS/JS `export` keyword, module scope in Python, an initial uppercase letter in Go, a bare `pub` in Rust, and a `public` modifier in Java. `pub(crate)` and `pub(super)` stop at the crate boundary and so count as unexported. C/C++ and Ruby have no equivalent marker and always report `exported: false`.
- `include_private` filters on each language's own notion of private: a leading underscore, a lowercase initial in Go, or an explicit access modifier. Because unexported is Go's only form of private, the default view of a Go package is its exported API surface; pass `include_private: true` for the rest. Rust visibility is reported but not filtered: non-`pub` items still appear, marked `exported: false`.
- A nested method's `visibility` is read from the source in every language that states it. TypeScript and Java put a modifier on the declaration; C++ and Ruby set it *sectionally*, so a `private:` label or a bare `private` governs every member after it until the next marker. Ruby's `private :sym` and `private def x` forms are read too. Defaults follow the language: a C++ `class` starts private and a `struct` starts public, and a Java method with no modifier is package-private, which the tool reports as `private` because it is not part of the type's outside-facing API. `protected` is reported as itself and survives `include_private: false`, being part of the inheritable API. Underscore-prefixed names stay private whatever the section says.

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
| `summary_only`    | boolean  | No       | Return only summary, no per-file details (default: false) |
| `limit`           | integer  | No       | Max files to return, sorted by complexity (default: 20)   |

**Metrics Returned:** every run computes all of them; there is no metric selector.

- `max_nesting_depth` / `avg_nesting_depth`: nesting level (loops, conditionals, callbacks). `else if` chains count as sibling branches, not extra nesting, in every supported language
- `max_parameters` / `avg_parameters`: function parameter counts; also counts props passed to React/JSX components (PascalCase elements) so heavily-propped components surface alongside high-arity functions
- `dependency_count`: import/require count per file
- `cognitive_complexity`: simplified cognitive complexity, summed over the whole file
- `function_count`: function nodes measured, the denominator for the averages
- `max_cyclomatic_complexity` / `avg_cyclomatic_complexity`: classic McCabe, per function
- `max_cognitive_complexity`: the worst single function's cognitive score

`cognitive_complexity` and `max_cognitive_complexity` are different numbers on purpose: the first is the whole-file sum, so it partly tracks file length, while the second names how bad the worst function actually is. A file of many simple functions scores high on the first and low on the second.

**Per-function reporting:** the `functions` array lists functions whose cyclomatic complexity exceeds 10, worst first, capped at 10 per file. Each entry carries a `severity` of `high` (over 10) or `extreme` (over 30) — radon's bands. The array is empty for files where nothing crosses the threshold. `summary.high_complexity_functions` and `summary.most_complex_function` count every function analyzed, ignoring both the per-file cap and `limit`.

Cyclomatic complexity is 1 plus the decision points in a function: conditionals, loops, exception handlers, ternaries, individual `switch`/`when`/`match` arms, and each logical operator. Unlike cognitive complexity it applies no nesting weight, so three nested `if`s score the same as three sequential ones, and it counts `else if` as the real predicate it is. A `default`/`else`/`_` arm adds nothing, and anonymous functions are not branches.

The rules are uniform across all nine grammars rather than matching radon exactly. Radon additionally charges for Python's `with`, `assert`, and comprehensions, which have no detectable counterpart in the other eight languages — counting them would make the same algorithm score higher in Python than in TypeScript. Expect scopewalker's Python numbers to sit slightly below radon's for code using those constructs.

Parameter counting is language-aware: Python skips `self`/`cls`, `*args`, `**kwargs`, and the bare `*` keyword-only marker; Go excludes the method receiver and expands grouped declarations (`func f(a, b, c int)` counts as 3); C/C++ parameter lists are read out of the function declarator.

Nesting and cognitive complexity likewise follow each grammar's own shape, but each runs off its own node list, so a construct can count toward one metric, both, or neither:

- **Both metrics:** `if`, `for`, and `while` in every grammar, including the less common loop spellings (`do`-`while` in TypeScript, JavaScript, Java, C, and C++, Java's for-each, C++ range-for); switches everywhere (`switch_statement` in C, C++, TypeScript, and JavaScript, `expression_switch_statement` and `type_switch_statement` in Go, `switch_expression` in Java); Rust's expression forms (`if`/`for`/`while`/`loop`/`match` and closures); Ruby's keyword-named `if`, `unless`, `while`, `until`, `for`, `case`, and `case ... in`.
- **Nesting only:** `try` blocks, anonymous functions in every grammar (`arrow_function` in TypeScript and JavaScript, `lambda` in Python and Ruby's stabby `->(x){}`, `func_literal` in Go, `lambda_expression` in Java and C++), and Ruby's `begin` plus both of its block forms. A lambda's own body is not an extra level: `->(x) { ... }` nests one deep, the same as the arrow function it corresponds to.
- **Cognitive complexity only:** `catch` clauses in every grammar that has one (`catch_clause` in TypeScript, JavaScript, Java, and C++, `except_clause` in Python, `rescue` in Ruby); ternaries in every grammar that has one (`ternary_expression` in TypeScript, JavaScript, and Java, `conditional_expression` in Python, C, and C++, `conditional` in Ruby; Go and Rust have no ternary operator); logical operators, both the `&&`/`||` form and the `and`/`or` keywords Python and Ruby also accept; and the `elif`/`elsif` nodes Python and Ruby give else-if chains. An else-if branch scores a flat 1 whatever its grammar calls it, so a chain of three branches costs 3 in every supported language. Ruby's statement modifiers (`b if a`, `c while x`, `g rescue nil`) also land here: they are branches, but with no block there is nothing to nest.

Cyclomatic complexity runs off a third list again, and diverges from the other two in three ways worth knowing: it counts each `switch` arm individually rather than charging once for the container (`switch_case` in TypeScript and JavaScript, `expression_case` and `type_case` in Go, `match_arm` in Rust, `switch_label` in Java, `case_statement` in C and C++, `case_clause` in Python, `when` and `in_clause` in Ruby), so a twelve-case switch scores 13 where cognitive complexity scores 1; it excludes anonymous functions entirely; and it counts `else if` rather than flattening it.

Ruby's iterator blocks (`xs.each do ... end` and `xs.each { |x| ... }`) count toward nesting but toward neither cognitive nor cyclomatic complexity. Both forms parse identically to any other block-taking call — `x.tap do ... end` is the same shape — so a loop cannot be told apart from a non-loop. Nesting can count them anyway because a block is a level of indentation either way; a branch count cannot. See [known-bugs.md](./known-bugs.md).

Each hotspot's `issue` field is one of `nesting_depth`, `parameters`, or `jsx_props` (a JSX component receiving more than 5 props). Cyclomatic and cognitive scores are reported through the `functions` array instead, not as hotspots.

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
        "dependency_count": 12, "cognitive_complexity": 45,
        "function_count": 9, "max_cyclomatic_complexity": 14,
        "avg_cyclomatic_complexity": 4.2, "max_cognitive_complexity": 21
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

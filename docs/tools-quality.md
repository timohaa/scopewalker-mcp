# Code Quality Tools

## get_documentation_coverage

Analyzes documentation coverage - identifies functions, classes, and methods missing docstrings or JSDoc comments.

**Parameters:**

| Name              | Type     | Required | Description                                                              |
|-------------------|----------|----------|--------------------------------------------------------------------------|
| `path`            | string   | Yes      | Path to file or directory                                                |
| `include_hidden`  | boolean  | No       | Include hidden files                                                     |
| `ignore_patterns` | string[] | No       | Glob patterns to exclude                                                 |
| `extensions`      | string[] | No       | Filter by extensions                                                     |
| `max_depth`       | integer  | No       | Maximum directory depth to traverse (max 64)                             |
| `max_files`       | integer  | No       | Maximum number of files to scan (max 10000)                              |
| `min_lines`       | integer  | No       | Only check symbols with at least this many lines (default: 1, max 10000) |
| `summary_only`    | boolean  | No       | Return only summary, no detailed item lists (default: false)             |
| `limit`           | integer  | No       | Max undocumented items to return (default: 20, max 5000)                 |

**Documentation Detection:**

| Language              | Recognized Formats          |
|-----------------------|-----------------------------|
| JavaScript/TypeScript | JSDoc (`/** */`), TSDoc     |
| Python                | Docstrings (`"""`, `'''`)   |
| Go                    | Godoc comments (`//`)       |
| Rust                  | Doc comments (`///`, `//!`) |
| Java                  | Javadoc (`/** */`)          |
| C/C++                 | JSDoc-style (`/** */`)      |
| Ruby                  | Line comments (`#`)         |

**What counts as documentable:** functions (including `const fn = () => {}` in TS/JS and C/C++ prototypes in headers), classes (TS/JS, Python, Java, Ruby, and C/C++ `class`/`struct` bodies), and methods. Inline callback arrows are not counted. C/C++ member functions are reported as methods, including members declared without a body; plain data members are ignored. Go receiver methods (`func (p *Point) Reset()`) count as methods. Go `struct`/`interface` types and Rust `struct`/`trait`/`enum` are not currently treated as documentable classes. A Ruby top-level `def` is typed as a function, and a `def` inside a class or module body as a method. `get_code_inventory` labels the same code the same way for class bodies, but drops module-body defs entirely: `module` is not one of its symbol types, so there is nothing to nest them under.

**Response:**

```json
{
  "path": "/path/to/target",
  "coverage": { "documented": 145, "undocumented": 32, "percentage": 81.9 },
  "undocumented_items": [
    {
      "path": "src/utils/parser.ts",
      "name": "parseConfig",
      "type": "function",
      "line": 45,
      "lines": 28
    }
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
  "truncated": { "items": 20, "total": 32 }
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

Detects code smells like TODO, FIXME, HACK, XXX, BUG, UNUSED, and DEPRECATED comments, plus unsafe casts in TypeScript.

**Note:** Comment-based smells use tree-sitter to avoid matches in string literals and code. The `unsafe_cast` smell detects TypeScript double casts through `unknown` or `any`. Examples include `x as unknown as T` and `x as any as T`. JavaScript has no corresponding `as` expression.

**Parameters:**

| Name              | Type     | Required | Description                                             |
|-------------------|----------|----------|---------------------------------------------------------|
| `path`            | string   | Yes      | Path to file or directory                               |
| `include_hidden`  | boolean  | No       | Include hidden files                                    |
| `ignore_patterns` | string[] | No       | Glob patterns to exclude                                |
| `extensions`      | string[] | No       | Filter by extensions                                    |
| `max_depth`       | integer  | No       | Maximum directory depth to traverse (max 64)            |
| `max_files`       | integer  | No       | Maximum number of files to scan (max 10000)             |
| `types`           | string[] | No       | Which smell types to detect (default: all)              |
| `limit`           | integer  | No       | Max files with smells to return (default: 20, max 5000) |
| `include_text`    | boolean  | No       | Include matching comment text (default: redacted)       |

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
    "by_type": {
      "todo": 15,
      "fixme": 8,
      "hack": 3,
      "xxx": 2,
      "bug": 0,
      "unused": 0,
      "deprecated": 0,
      "unsafe_cast": 0
    }
  }
}
```

**Privacy default:** Comment text is redacted unless `include_text` is set to `true`. Included text is truncated at 200 characters.
**Size guard:** Files over 1 MB are skipped to avoid expensive parsing.

**Example:**

```json
{
  "name": "get_code_smells",
  "arguments": {
    "path": "./src",
    "types": ["todo", "fixme", "hack"],
    "extensions": [".ts", ".tsx"]
  }
}
```

---

## get_prop_drilling

Detects parameter threading (prop drilling) by finding parameter names passed through chains of functions. High occurrence counts across many files indicate parameters that may be better managed via context, dependency injection, or module-level state.

**Parameters:**

| Name              | Type     | Required | Description                                                                   |
|-------------------|----------|----------|-------------------------------------------------------------------------------|
| `path`            | string   | Yes      | Path to file or directory                                                     |
| `include_hidden`  | boolean  | No       | Include hidden files                                                          |
| `ignore_patterns` | string[] | No       | Glob patterns to exclude                                                      |
| `extensions`      | string[] | No       | Filter by file extensions                                                     |
| `max_depth`       | integer  | No       | Maximum directory depth to traverse (max 64)                                  |
| `max_files`       | integer  | No       | Maximum number of files to scan (max 10000)                                   |
| `limit`           | integer  | No       | Maximum number of threaded parameters to return (default: 20, max 5000)       |
| `min_occurrences` | integer  | No       | Minimum function occurrences to flag a parameter (default: 3, max 1000)       |
| `exclude_common`  | boolean  | No       | Exclude common parameter names like `id`, `key`, `className` (default: false) |
| `summary_only`    | boolean  | No       | Return only summary without per-parameter details (default: false)            |

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

---

## find_dead_code

Finds declared symbols and private methods that nothing in the scanned files references.

**Parameters:**

| Name              | Type     | Required | Description                                          |
|-------------------|----------|----------|------------------------------------------------------|
| `path`            | string   | Yes      | Path to file or directory                            |
| `include_hidden`  | boolean  | No       | Include hidden files                                 |
| `ignore_patterns` | string[] | No       | Glob patterns to exclude                             |
| `extensions`      | string[] | No       | Filter by extensions                                 |
| `max_depth`       | integer  | No       | Maximum directory depth to traverse (max 64)         |
| `max_files`       | integer  | No       | Maximum number of files to scan (max 10000)          |
| `limit`           | integer  | No       | Max items to return per list (default: 20, max 5000) |

**How detection works:** the tool extracts top-level classes, functions, interfaces, enums,
and constants, plus private class methods, as candidates. It then counts every name-token
occurrence across all scanned files and subtracts each candidate's own declaration. A candidate
with zero remaining occurrences is unreferenced. String literals and symbols count as
references, so reflection patterns like `getattr(o, "foo")`, `send(:foo)`, and `obj["foo"]` keep
a name alive. Comments do not count, with one exception: Go's `//export name` and
`//go:linkname name` directives count their named symbol as referenced.

**Visibility scope:**

| Scope     | Meaning                                             | Examples                                                                                                                                                                                                                              |
|-----------|-----------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `local`   | Reachable only from its own file or class           | A non-exported top-level symbol in a TS/JS module file; a C/C++ private method or `static` function in a `.c`/`.cpp` file                                                                                                             |
| `package` | Reachable from sibling files under the scanned path | Private methods in every language except C/C++; Go unexported names; Rust items with no visibility modifier; Java `private` and package-private classes; Python `_`-prefixed names                                                    |
| `public`  | Reachable from outside the scan                     | Exported TS/JS symbols; globals of a TS/JS script file; Go exported names; Rust `pub` (including `pub(crate)` and `pub(super)`); Java `public`/`protected`; Ruby top-level symbols; C/C++ non-static symbols and anything in a header |

Private methods are `package` rather than `local` because no supported language confines them
to a file: TypeScript allows `obj["name"]()` past `private`, Java reflection reaches any member,
an underscore prefix is a convention in JS, Python and Ruby, and a Ruby subclass or reopened
class can call a private method by name. Each of those is a name token the scan counts, so a
directory scan that covers the whole project proves the miss. C/C++ headers are textually included, so a
`static` function or a private member declared in a `.h`/`.hpp` file can be reached from any
source file that includes it.

**Classification:** a candidate with zero references becomes `dead_code` when its scope is
`local`, or when its scope is `package` and the target path is a directory scanned without
`max_depth`, and only while `summary.scan_complete` is `true`. A depth-limited scan can omit a
Rust child module that uses its parent's private items, so it cannot prove a `package` symbol
dead. Everything else with zero references becomes
`unreferenced_exports`, the list for findings that need human judgment because the tool cannot
prove they are unreachable. `scan_complete` is `false` when any supported-language file in the
scan was not parsed: the `max_files` cap was reached with files remaining, a file exceeded the 1
MB guard, a file could not be read, or parsing failed. When `scan_complete` is `false`, every
finding moves to `unreferenced_exports`, because a skipped file could hold the missing reference.

**Exclusions:** a candidate is dropped before reference counting when any of these apply:

- The declaration carries an annotation, decorator, or attribute: TS/JS decorators, Python
  `@decorator`, Java annotations (`@Test`, `@PostConstruct`, `@Scheduled`, `@Entity`), C/C++
  attributes, and Rust attributes other than the inert allowlist (comments between an attribute and its item are skipped) (`derive`, `cfg`, `allow`,
  `warn`, `deny`, `forbid`, `doc`, `inline`, `must_use`, `deprecated`, `repr`, `non_exhaustive`,
  `cold`, `track_caller`). `cfg_attr` and every other Rust attribute (`test`, `no_mangle`,
  `wasm_bindgen`, `tauri::command`, `tokio::main`, `proc_macro`, `bench`, `ctor`) excludes the
  declaration.
- Language entry points and framework hooks: Go `main`, `init`, and
  `Test`/`Benchmark`/`Example`/`Fuzz`-prefixed functions; Rust and C/C++ `main`; Python
  `test_`-prefixed functions, `Test`-prefixed classes, and dunder methods; Java serialization
  hooks (`readObject`, `writeObject`, `readResolve`, `writeReplace`, `readObjectNoData`,
  `finalize`).
- A private method of a class that extends, implements, or mixes in anything (TS/JS
  `extends`, a Python base list, a Ruby superclass or `include`/`extend`/`prepend`, a C++ base
  class), and any TypeScript method marked `override`. A base class calls its hooks by name,
  such as `_transform` on a Node stream, and the base usually lives outside the scan. Java
  `private` methods and TypeScript methods with an explicit `private` keyword stay candidates,
  because neither can override a base member.
- Rust functions inside a `trait` or an `impl Trait for Type` block. They are dispatched through
  the trait, so `Display::fmt` runs on every `{}` without its name at any call site. Inherent
  `impl Type` methods remain candidates.
- TypeScript ambient code: `.d.ts` files are skipped entirely, and any node under an
  `ambient_declaration` (`declare ...`) is skipped.
- A C/C++ file whose preprocessor text contains `##` (token pasting can synthesize names not
  visible in the source) yields no candidates.
- A C++ name qualified with `::` (an out-of-line definition such as `Widget::resize`) is dropped;
  it adds a reference to the declaration instead of a new candidate.

**Limitations:**

- Detection is name-based. Two symbols with the same name across different files shadow each
  other: if either is used, neither is reported, even if one of them truly is dead.
- A name that appears only inside a comment (other than the Go directives above) still counts as
  unreferenced, because comments are not scanned for references.
- Any skipped file — from the `max_files` cap or otherwise — sets `summary.scan_complete` to
  `false` and moves every finding to `unreferenced_exports`.
- `unreferenced_exports` can include symbols consumed outside the scan, such as a published
  package's public API or a plugin entry point loaded by another repository.
- Python's leading-underscore convention is not an enforced boundary, so `_name` symbols are
  scoped `package`, not `local`. Scan the whole project rather than a subdirectory to see them
  reach `dead_code`.
- Java splits one package across source roots (`src/main/java` and `src/test/java`). A
  package-private member used only from the test root appears in `dead_code` when only the main
  root is scanned. That is the same behavior as the test-exclusion recipe below.

**Recipe:** to find symbols used only by tests, exclude the test files from the scan:

```json
{ "path": "./src", "ignore_patterns": ["**/*.test.ts"] }
```

Anything that becomes unreferenced once tests are excluded is exercised only by its own tests,
not by production code.

**Response:**

```json
{
  "path": "/path/to/target",
  "is_directory": true,
  "dead_code": [
    { "file": "src/utils/legacy.ts", "name": "formatLegacyDate", "type": "function", "line": 12 }
  ],
  "unreferenced_exports": [
    { "file": "src/api/index.ts", "name": "createClient", "type": "function", "line": 40 }
  ],
  "summary": {
    "files_scanned": 45,
    "files_skipped": 0,
    "scan_complete": true,
    "symbols_checked": 312,
    "dead_code_found": 1,
    "unreferenced_exports_found": 1
  }
}
```

`type` is one of `class`, `function`, `interface`, `enum`, `constant`, `method`.

**Example:**

```json
{
  "name": "find_dead_code",
  "arguments": { "path": "./src", "ignore_patterns": ["**/*.test.ts"] }
}
```

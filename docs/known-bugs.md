# Known Bugs and Limitations

Behaviour that is wrong or incomplete today. Every entry here was reproduced against the
tools rather than inferred from reading the code; each one lists the input that triggers
it and what the tool actually returns.

Two kinds of entry:

- **Bugs**: the tool returns something wrong, or silently drops data the user asked for.
- **Limitations**: the tool is knowingly incomplete, and the behaviour is documented in
  `docs/tools-*.md`. Listed here so the gaps are visible in one place.

Verified against version 1.0.5.

---

## Bugs

### Go methods on a type declared in another file are silently dropped

**Tools:** `get_code_inventory`

`attachGoMethods` pairs a method to its receiver type by name within a single file. Go
packages routinely split a type and its methods across files, and a method with no local
type to attach to is discarded rather than reported.

Given `types.go` containing `type Point struct{ X int }` and `methods.go` containing
`func (p *Point) Scale(f int)`, the inventory returns `Point` with **no** methods, and
`methods.go` is omitted from the response entirely (files with no items are dropped). The
method appears nowhere in the output, and nothing signals that it was skipped.

Fixing this needs the inventory to aggregate across files before matching receivers,
which the current per-file walk does not do.

### Go and Rust constants never appear in the inventory

**Tools:** `get_code_inventory`

A file containing only `const MaxRetries = 3` (Go) or `pub const MAX: i32 = 3;` /
`pub static NAME: &str = "x";` (Rust) yields an empty inventory.

Two separate causes:

- Go's `const_declaration` is mapped to `constant`, but the name lives on a nested
  `const_spec`, so `extractName` finds nothing and the item is dropped.
- Rust's `const_item` and `static_item` are not in `NODE_TYPE_MAP` at all.

The Constant column in the language table in `docs/tools-health.md` shows `-` for both
languages, so the table is accurate, but it reads as "this language has no constants"
rather than "the tool cannot see them".

### Grouped Go `type (...)` declarations report only their first type

**Tools:** `get_code_inventory`

`getGoTypeDeclarationKind` takes the **first** `type_spec` child of a `type_declaration`, and
the surrounding walk emits one item per declaration rather than one per spec. Go's grouped
form declares several types under a single `type_declaration`, so everything after the first
is silently dropped.

Given a file containing only:

```go
type (
    Celsius float64
    Widget  struct{ X int }
    Shape   interface{ Area() float64 }
)
```

the inventory returns a single item (`Celsius`, typed `interface`) and `summary` reports
`total_classes: 0`, `exported_symbols: 1`. `Widget` and `Shape` appear nowhere, and nothing
signals that two declared types were skipped. The struct is what makes this more than a
mislabel: a Go package using the grouped form for its type block reports no classes at all.

Fixing this needs the walk to emit one item per `type_spec`, which the current
one-item-per-node mapping does not do.

### `max_files` spends its budget on files that are never analyzed

**Tools:** `check_thresholds`, `get_code_inventory`, `get_code_smells`,
`get_complexity_metrics`, `get_documentation_coverage`, `get_functions`, `get_prop_drilling`

Every tool that accepts `max_files` (all of them except `get_line_counts`, which has no such
parameter) applies it by slicing the discovered path list *before* language detection, so
unsupported files consume the cap and are then skipped. `max_files: N` means "consider the
first N paths", not "analyze N files".

In a directory containing `README.md`, `types.ts`, and `utils.ts`, `max_files: 1` spends the
cap on `README.md`, which has no supported language: `get_functions` returns
`total_files_analyzed: 0`, `get_code_inventory` `total_files: 0`, and
`get_documentation_coverage` `files_analyzed: 0`. `check_thresholds` reports
`functions_checked: 0` while still returning `files_checked: 3`, because its file-size scan
runs through tokei and is not bounded by `max_files`. On a repository with many non-source
files at the top of the walk, a small `max_files` can return an empty result that is
indistinguishable from "nothing to report".

Passing `extensions` alongside `max_files` avoids it, because the filter is applied during
discovery. Pinned by tests in `src/tools/functions.counts.test.ts`.

### Ruby methods inside a `module` body are invisible to the inventory

**Tools:** `get_code_inventory`

`getItemType` treats a `method` node as a function only when its parent is not
`body_statement`. Class methods are expected to be nested under their class already, but
`module` has no entry in `NODE_TYPE_MAP` for a method to nest under, so a method whose
parent is a module's `body_statement` has nowhere to attach and is dropped instead.

A file containing only `module Helpers; def helper; end; end` returns an empty inventory
(`total_files: 0`): the whole file disappears, files with no matched items being dropped
the same as the Go case above. `get_documentation_coverage` runs a separate walk and still
sees `helper` as type `method`, so the two tools disagree about whether the file has
anything in it at all.

---

## Limitations

### Rust `include_private: false` does not filter anything

**Tools:** `get_code_inventory`

`isPrivateSymbol` has branches for leading underscores, TypeScript's `private` modifier,
and Go's lowercase-initial rule, but none for Rust. A crate with `pub fn draw`, `fn secret`,
and `fn private_fn` returns all three whether `include_private` is `true` or `false`.
Visibility is still *reported* correctly (non-`pub` items are marked `exported: false`);
it just is not used as a filter.

Documented in `docs/tools-health.md`.

### Rust `impl` methods are reported as standalone functions

**Tools:** `get_code_inventory`, `get_documentation_coverage`

Methods inside an `impl Widget` block are not nested under `Widget`. The inventory lists
`Widget` as a class and `draw`/`secret` as separate top-level functions;
`get_documentation_coverage` likewise types them `function` rather than `method`.

Go, C/C++, Python, and Ruby all attach members to their type. Rust is the outlier.

Documented in `docs/tools-health.md`.

### Go and Rust type declarations are not documentable classes

**Tools:** `get_documentation_coverage`

`CLASS_TYPES` covers the `class`/`struct` node types of TS/JS, Python, Java, Ruby, and
C/C++. Go `struct`/`interface` and Rust `struct`/`trait`/`enum` are absent, so an
undocumented Rust `pub struct Widget` does not count against coverage: a file declaring
`Widget` plus three functions reports `total_symbols: 3`, not 4.

Documented in `docs/tools-quality.md`.

### Ruby brace blocks do not count toward nesting

**Tools:** `get_complexity_metrics`

Ruby's `do ... end` block counts as a nesting level; its brace form does not. Four nested
`{ |x| ... }` blocks report `max_nesting_depth: 0`.

This one is deliberate rather than an oversight: tree-sitter-ruby names the brace form
`block`, which is also tree-sitter-rust's node for *any* braced scope. Adding it would make
every Rust function body register as a nesting level. Fixing it properly means threading the
language through `calculateNestingDepth`, which currently takes no language argument.

Documented in `docs/tools-health.md`.

### `exported` is always false for Java, C/C++, and Ruby

**Tools:** `get_code_inventory`

These languages have no declaration-site export marker comparable to `export`, `pub`, or
Go's capitalization rule. Java's `public`/`private` modifiers are not consulted. Every
symbol reports `exported: false`, and `exported_symbols` in the summary is `0` for a
codebase written in them.

Documented in `docs/tools-health.md`.

### Only the `.gitignore` at the scanned path is honored

**Tools:** `check_thresholds`, `get_code_inventory`, `get_code_smells`,
`get_complexity_metrics`, `get_documentation_coverage`, `get_functions`, `get_prop_drilling`

`createIgnoreFilter` in `src/lib/glob.ts` reads exactly one file, `<scanned path>/.gitignore`.
Git resolves ignore rules from every `.gitignore` between the repository root and the file;
these tools do not walk in either direction, so two cases diverge from `git status`.

Given a root holding `.gitignore` (`ignored-root.ts`, `sub/ignored-by-root.ts`) and
`sub/.gitignore` (`ignored-nested.ts`):

- Scanning the root returns `keep.ts`, `sub/keep2.ts`, **and** `sub/ignored-nested.ts` — the
  nested `.gitignore` below the scan root is never read.
- Scanning `sub/` returns `keep2.ts` **and** `ignored-by-root.ts` — the root `.gitignore`
  above the scan root is never read, even though `sub/.gitignore` now is.

Repositories that place per-package `.gitignore` files under a monorepo root, or that are
analyzed one subdirectory at a time, will see generated files counted as source. Passing the
missed patterns through `ignore_patterns` is the workaround.

The tokei-backed tools (`get_line_counts`, file-size checks in `check_thresholds`) are not
affected: tokei applies full git ignore semantics, though only inside a git repository.

Documented in `docs/tools-overview.md`.

### Extension filters silently return nothing on tokei-backed tools

**Tools:** `get_line_counts`, `check_thresholds`

`extensions` is translated to tokei language names through a fixed table. An extension
outside that table is passed through verbatim and only matches if it happens to name a
tokei language. `.zig` works because the language is called Zig; `.tf` does not, because
tokei calls that language HCL. The mismatch returns an empty result rather than an error,
which is indistinguishable from "no such files".

Documented in `docs/tools-overview.md`.

---

## Reporting something not listed here

Open an issue with the smallest input that reproduces it, the tool and arguments used, and
the response you got. Reproductions in a language the tools already support are the most
useful; a lot of these entries are grammar-name mismatches that only show up in one
language.

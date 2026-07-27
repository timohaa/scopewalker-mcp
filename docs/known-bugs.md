# Known Bugs and Limitations

Behaviour that is wrong or incomplete today. Every entry here was reproduced against the
tools rather than inferred from reading the code — each one lists the input that triggers
it and what the tool actually returns.

Two kinds of entry:

- **Bugs** — the tool returns something wrong, or silently drops data the user asked for.
- **Limitations** — the tool is knowingly incomplete, and the behaviour is documented in
  `docs/tools-*.md`. Listed here so the gaps are visible in one place.

Verified against version 1.0.2.

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

The Constant column in the language table in `docs/tools-health.md` shows `—` for both
languages, so the table is accurate — but it reads as "this language has no constants"
rather than "the tool cannot see them".

### Go and Java `switch` do not count toward cognitive complexity

**Tools:** `get_complexity_metrics`

`CONTROL_FLOW_TYPES` contains `switch_statement`, which is what C, C++, TypeScript, and
JavaScript emit. Go emits `expression_switch_statement` and Java emits `switch_expression`,
so neither scores.

A single-`switch` function returns `cognitive_complexity: 1` in C and TypeScript,
`0` in Go, and `0` in Java. Java's `switch_expression` *is* in `NESTING_TYPES`, so it
reports `max_nesting_depth: 1` while still scoring zero cognitive complexity — the two
metrics disagree about the same construct. Go's switch is absent from both lists and
scores zero on each.

Both are one-line additions to the type lists, gated on the same `node.isNamed` check the
Ruby entries already use.

---

## Limitations

### Rust `include_private: false` does not filter anything

**Tools:** `get_code_inventory`

`isPrivateSymbol` has branches for leading underscores, TypeScript's `private` modifier,
and Go's lowercase-initial rule, but none for Rust. A crate with `pub fn draw`, `fn secret`,
and `fn private_fn` returns all three whether `include_private` is `true` or `false`.
Visibility is still *reported* correctly — non-`pub` items are marked `exported: false` —
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
undocumented Rust `pub struct Widget` does not count against coverage — a file declaring
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

### Extension filters silently return nothing on tokei-backed tools

**Tools:** `get_line_counts`, `check_thresholds`

`extensions` is translated to tokei language names through a fixed table. An extension
outside that table is passed through verbatim and only matches if it happens to name a
tokei language. `.zig` works because the language is called Zig; `.tf` does not, because
tokei calls that language HCL. The mismatch returns an empty result rather than an error,
which is indistinguishable from "no such files".

Documented in `docs/tools-overview.md`.

### Parameters accepted but not implemented

**Tools:** `get_complexity_metrics`, `get_code_inventory`

- `metrics` — accepted and validated, but all metrics are always calculated and returned.
- `group_by` — accepted, but results are always grouped by file.

Both are accepted for forward compatibility and are noted as such in `docs/tools-health.md`.
Passing them changes nothing about the response.

---

## Reporting something not listed here

Open an issue with the smallest input that reproduces it, the tool and arguments used, and
the response you got. Reproductions in a language the tools already support are the most
useful — a lot of these entries are grammar-name mismatches that only show up in one
language.

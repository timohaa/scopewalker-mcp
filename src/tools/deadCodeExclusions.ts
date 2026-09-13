import type Parser from "tree-sitter";
import type { DeadCodeSymbolType, SupportedLanguage } from "../types/index.js";

// Rust attributes that describe an item without giving anything else a way to
// call it. Every other attribute (test, no_mangle, wasm_bindgen, tauri::command,
// ctor, and the whole macro ecosystem) can register the item somewhere unseen.
const INERT_RUST_ATTRIBUTES = new Set([
  "derive",
  "cfg",
  "allow",
  "warn",
  "deny",
  "forbid",
  "doc",
  "inline",
  "must_use",
  "deprecated",
  "repr",
  "non_exhaustive",
  "cold",
  "track_caller",
]);

// Names a runtime, toolchain or test harness calls without any in-code reference.
const ENTRY_POINT_NAMES: Partial<Record<SupportedLanguage, Set<string>>> = {
  go: new Set(["main", "init"]),
  rust: new Set(["main"]),
  c: new Set(["main"]),
  cpp: new Set(["main"]),
  java: new Set([
    "readObject",
    "writeObject",
    "readResolve",
    "writeReplace",
    "readObjectNoData",
    "finalize",
  ]),
};

const GO_TEST_NAME = /^(?:Test|Benchmark|Example|Fuzz)/;
const PYTHON_DUNDER = /^__\w+__$/;

/** Checks whether a name belongs to a language's entry points or test conventions. */
export function isExcludedName(
  name: string,
  language: SupportedLanguage,
  type: DeadCodeSymbolType
): boolean {
  if (ENTRY_POINT_NAMES[language]?.has(name) === true) return true;
  if (language === "go") return GO_TEST_NAME.test(name);
  if (language === "python") {
    if (PYTHON_DUNDER.test(name)) return true;
    if (type === "class") return name.startsWith("Test");
    return name.startsWith("test_");
  }
  return false;
}

/** Steps back over comment siblings, which may sit between an attribute and its item. */
function previousCodeSibling(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
  let sibling = node.previousNamedSibling;
  while (sibling?.type.includes("comment") === true) {
    sibling = sibling.previousNamedSibling;
  }
  return sibling;
}

/** Reads the attribute path a Rust `#[...]` names, up to its arguments. */
function rustAttributeName(text: string): string {
  const inner = text.replace(/^#!?\[/, "");
  const path = /^[^(=\]]+/.exec(inner);
  return path ? path[0].trim() : "";
}

/**
 * Checks for a Rust attribute that could hand the item to something unseen.
 *
 * Attributes precede the item as siblings, so the whole preceding run is read.
 * `cfg_attr` is deliberately absent from the inert set: it expands to an
 * arbitrary attribute under a build flag.
 */
function hasActiveRustAttribute(node: Parser.SyntaxNode): boolean {
  let sibling = previousCodeSibling(node);
  while (sibling?.type === "attribute_item") {
    if (!INERT_RUST_ATTRIBUTES.has(rustAttributeName(sibling.text))) return true;
    sibling = previousCodeSibling(sibling);
  }
  return false;
}

/**
 * Checks for a TS/JS decorator on a class or member.
 *
 * The two grammars place it differently: a decorated class, and a decorated
 * member in JavaScript, carry the decorator as a child, while TypeScript emits
 * a member's decorators as preceding siblings inside the class body.
 */
function hasDecorator(node: Parser.SyntaxNode): boolean {
  if (node.children.some((child) => child.type === "decorator")) return true;
  return previousCodeSibling(node)?.type === "decorator";
}

// Heritage clauses per grammar: TS/JS class_heritage, Python's base list,
// Ruby and Java superclass, C++ base_class_clause.
const HERITAGE_TYPES = new Set([
  "class_heritage",
  "argument_list",
  "superclass",
  "base_class_clause",
]);
const RUBY_MIXIN_CALLS = new Set(["include", "extend", "prepend"]);

/** Checks whether a Ruby class body mixes in a module, whose methods may call the class's own. */
function hasRubyMixin(classNode: Parser.SyntaxNode): boolean {
  const body = classNode.children.find((child) => child.type === "body_statement");
  if (!body) return false;
  return body.children.some(
    (child) => child.type === "call" && RUBY_MIXIN_CALLS.has(child.children[0]?.text ?? "")
  );
}

/**
 * Checks whether a class inherits from or mixes in anything.
 *
 * A base class calls its hooks by name (`_transform` on a Node stream,
 * `paintEvent` on a Qt widget), and the base usually lives outside the scan,
 * so a subclass's private-looking method cannot be proven unused.
 */
export function hasBaseClass(classNode: Parser.SyntaxNode, language: SupportedLanguage): boolean {
  if (classNode.children.some((child) => HERITAGE_TYPES.has(child.type))) return true;
  return language === "ruby" && hasRubyMixin(classNode);
}

/** Checks a Java declaration's `modifiers` child for any annotation. */
function hasJavaAnnotation(node: Parser.SyntaxNode): boolean {
  const modifiers = node.children.find((child) => child.type === "modifiers");
  if (!modifiers) return false;
  return modifiers.children.some(
    (child) => child.type === "annotation" || child.type === "marker_annotation"
  );
}

/**
 * Checks for an annotation, decorator or attribute on a declaration.
 *
 * Any of them can register the symbol with a framework, so the reference that
 * keeps it alive never appears in the source at all.
 */
function hasAnnotation(node: Parser.SyntaxNode, language: SupportedLanguage): boolean {
  switch (language) {
    case "typescript":
    case "javascript":
      return hasDecorator(node);
    case "python":
      return node.parent?.type === "decorated_definition";
    case "java":
      return hasJavaAnnotation(node);
    case "rust":
      return hasActiveRustAttribute(node);
    case "c":
    case "cpp":
      return node.children.some(
        (child) => child.type === "attribute_specifier" || child.type === "attribute_declaration"
      );
    default:
      return false;
  }
}

/**
 * Checks for a Rust trait scope, whose functions are never candidates.
 *
 * A trait's methods and an `impl Trait for X` block's methods are dispatched
 * through the trait, so `Display::fmt` runs on every `{}` without its name ever
 * appearing at a call site.
 */
export function isTraitScope(node: Parser.SyntaxNode): boolean {
  if (node.type === "trait_item") return true;
  return node.type === "impl_item" && node.childForFieldName("trait") !== null;
}

/** Checks whether a declaration must never be reported as dead. */
export function isExcludedDeclaration(
  node: Parser.SyntaxNode,
  name: string,
  language: SupportedLanguage,
  type: DeadCodeSymbolType
): boolean {
  return isExcludedName(name, language, type) || hasAnnotation(node, language);
}

/**
 * Checks for C/C++ token pasting, which can build a name no token in the file spells.
 * A file using it yields no candidates, since any symbol there might be reached
 * through a name the preprocessor assembles.
 */
export function hasTokenPasting(code: string): boolean {
  return code.includes("##");
}

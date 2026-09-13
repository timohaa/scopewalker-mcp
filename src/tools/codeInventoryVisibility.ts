import type Parser from "tree-sitter";
import type { SupportedLanguage } from "../types/index.js";

// Go's spec exports an identifier when its first character is an uppercase
// letter, tested against Unicode's Lu category rather than the ASCII range.
const GO_EXPORTED = /^\p{Lu}/u;

/** Reads a Rust `visibility_modifier`, e.g. `pub` or `pub(crate)`. */
function getRustVisibility(node: Parser.SyntaxNode): string | null {
  const modifier = node.children.find((child) => child.type === "visibility_modifier");
  return modifier?.text ?? null;
}

/** Checks for a Rust `trait` block or an `impl Trait for Type` block. */
export function isTraitScope(node: Parser.SyntaxNode): boolean {
  if (node.type === "trait_item") return true;
  return node.type === "impl_item" && node.childForFieldName("trait") !== null;
}

/**
 * Checks for a Rust function declared inside a trait scope.
 *
 * Such functions carry no `pub` of their own because they take the trait's
 * visibility, so a missing keyword says nothing about whether they are private.
 * They sit one `declaration_list` below the trait or impl, so no ancestor walk
 * is needed.
 */
function isRustTraitMember(node: Parser.SyntaxNode): boolean {
  if (node.type !== "function_item" && node.type !== "function_signature_item") return false;
  const list = node.parent;
  if (list?.type !== "declaration_list" || list.parent === null) return false;
  return isTraitScope(list.parent);
}

/**
 * Reads a Java access modifier off a declaration's optional `modifiers` child.
 *
 * Returns null when the declaration carries no access modifier at all, which is
 * Java's package-private default rather than an absence of information.
 */
export function getJavaAccessModifier(
  node: Parser.SyntaxNode
): "public" | "private" | "protected" | null {
  const modifiers = node.children.find((child) => child.type === "modifiers");
  if (!modifiers) return null;

  for (const child of modifiers.children) {
    if (child.type === "public" || child.type === "private" || child.type === "protected") {
      return child.type;
    }
  }
  return null;
}

/** Determines if a symbol is private based on naming conventions or access modifiers. */
export function isPrivateSymbol(
  name: string,
  node: Parser.SyntaxNode,
  language: SupportedLanguage
): boolean {
  if (name.startsWith("_")) return true;

  // Unexported is the only private Go has, so capitalization settles both this
  // and isExported — there is no third state to distinguish.
  if (language === "go") return !GO_EXPORTED.test(name);

  if (language === "rust") return !isRustTraitMember(node) && getRustVisibility(node) !== "pub";

  if (language === "typescript" || language === "javascript") {
    return node.children.some(
      (child) => child.type === "accessibility_modifier" && child.text === "private"
    );
  }

  // Java's default access is package-private, so an absent modifier is a positive
  // statement that the symbol is not part of the type's outside-facing API.
  if (language === "java") {
    const access = getJavaAccessModifier(node);
    return access === "private" || access === null;
  }

  return false;
}

/** Checks if a node is exported based on language convention or export keywords. */
export function isExported(
  name: string,
  node: Parser.SyntaxNode,
  language: SupportedLanguage
): boolean {
  const parent = node.parent;
  if (!parent) return false;

  if (language === "go") return GO_EXPORTED.test(name);

  // `pub(crate)` and `pub(super)` confine a symbol to its own crate or module,
  // so only a bare `pub` puts it on the public API surface.
  if (language === "rust") return getRustVisibility(node) === "pub";

  // Java's `public` modifier serves as the declaration-site export marker.
  if (language === "java") return getJavaAccessModifier(node) === "public";

  if (
    parent.type === "export_statement" ||
    parent.type === "export_declaration" ||
    parent.type === "named_exports"
  ) {
    return true;
  }

  if (node.children.some((child) => child.text === "export")) return true;

  if (language === "python") return isPythonModuleLevel(parent);

  return false;
}

/**
 * Checks that a Python definition sits at module scope.
 *
 * A decorator wraps the definition in a `decorated_definition`, so the module is
 * the definition's grandparent rather than its parent whenever one is applied.
 */
function isPythonModuleLevel(parent: Parser.SyntaxNode): boolean {
  if (parent.type === "module") return true;

  return parent.type === "decorated_definition" && parent.parent?.type === "module";
}

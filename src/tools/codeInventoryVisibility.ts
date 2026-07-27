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

  if (language === "typescript" || language === "javascript") {
    return node.children.some(
      (child) => child.type === "accessibility_modifier" && child.text === "private"
    );
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

  if (
    parent.type === "export_statement" ||
    parent.type === "export_declaration" ||
    parent.type === "named_exports"
  ) {
    return true;
  }

  if (node.children.some((child) => child.text === "export")) return true;

  if (language === "python") return parent.type === "module";

  return false;
}

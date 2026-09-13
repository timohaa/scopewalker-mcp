import type Parser from "tree-sitter";
import { walkNode } from "../lib/astWalker.js";
import type { InventoryItem, SupportedLanguage } from "../types/index.js";

/** Collects the local names an `export { a, b as c }` clause puts on the API surface. */
function readExportClause(clause: Parser.SyntaxNode, names: Set<string>): void {
  for (const specifier of clause.namedChildren) {
    if (specifier.type !== "export_specifier") continue;

    // The `name` field holds the local binding; an alias renames it for importers.
    const local = specifier.childForFieldName("name");
    if (local) names.add(local.text);
  }
}

/** Collects the name `export default X` exports, where X refers to a declaration above. */
function readDefaultExport(statement: Parser.SyntaxNode, names: Set<string>): void {
  if (!statement.children.some((child) => child.type === "default")) return;

  const identifier = statement.children.find((child) => child.type === "identifier");
  if (identifier) names.add(identifier.text);
}

/** Reads an `export` statement in either of its indirect forms. */
function readExportStatement(statement: Parser.SyntaxNode, names: Set<string>): void {
  const clause = statement.children.find((child) => child.type === "export_clause");
  if (clause) {
    readExportClause(clause, names);
    return;
  }

  readDefaultExport(statement, names);
}

/** Collects the names an object literal lists, as in `module.exports = { A, B }`. */
function readExportedObject(value: Parser.SyntaxNode, names: Set<string>): void {
  for (const property of value.namedChildren) {
    if (property.type === "shorthand_property_identifier") names.add(property.text);
  }
}

/** Reads the CommonJS `module.exports = { X }` and `exports.X = X` forms. */
function readCommonJsExport(node: Parser.SyntaxNode, names: Set<string>): void {
  if (node.type !== "assignment_expression") return;

  const target = node.childForFieldName("left");
  if (target?.type !== "member_expression") return;
  if (target.text !== "module.exports" && !target.text.startsWith("exports.")) return;

  const value = node.childForFieldName("right");
  if (!value) return;

  if (value.type === "identifier") names.add(value.text);
  if (value.type === "object") readExportedObject(value, names);
}

/**
 * Collects TS/JS names exported apart from their declaration.
 *
 * A declaration marked `export` in place is recognized at the declaration site.
 * These forms name a symbol declared elsewhere in the file, so they can only be
 * resolved once the whole file has been read.
 */
export function collectExportedNames(
  rootNode: Parser.SyntaxNode,
  language: SupportedLanguage
): Set<string> {
  const names = new Set<string>();
  if (language !== "typescript" && language !== "javascript") return names;

  walkNode(rootNode, (node) => {
    if (node.type === "export_statement") {
      readExportStatement(node, names);
      return;
    }
    readCommonJsExport(node, names);
  });

  return names;
}

/** Marks items whose name appears in a separate export statement. */
export function markExported(items: InventoryItem[], names: Set<string>): InventoryItem[] {
  return items.map((item) =>
    item.exported || !names.has(item.name) ? item : { ...item, exported: true }
  );
}

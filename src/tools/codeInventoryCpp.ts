import type Parser from "tree-sitter";
import type { InventoryItem } from "../types/index.js";

// A declarator names its function differently by context: free functions use
// `identifier`, out-of-line definitions `qualified_identifier` (`Widget::resize`),
// in-class members `field_identifier`, and C++ special members get a node type
// of their own (`~Widget`, `operator==`).
const DECLARATOR_NAME_TYPES = [
  "identifier",
  "qualified_identifier",
  "field_identifier",
  "destructor_name",
  "operator_name",
];

// A pointer or reference return type wraps the declarator that carries the name,
// so `struct Foo *make(void)` hides its function_declarator one level down.
const DECLARATOR_WRAPPERS = ["pointer_declarator", "reference_declarator"];

/** Finds a definition's function_declarator, unwrapping pointer and reference returns. */
export function findFunctionDeclarator(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
  for (const child of node.children) {
    if (child.type === "function_declarator") return child;

    if (DECLARATOR_WRAPPERS.includes(child.type)) {
      const inner = findFunctionDeclarator(child);
      if (inner) return inner;
    }
  }
  return null;
}

/** Extracts the declared name from a C/C++ function_declarator node. */
export function extractDeclaratorName(declarator: Parser.SyntaxNode): string | null {
  const name = declarator.children.find((child) => DECLARATOR_NAME_TYPES.includes(child.type));
  return name?.text ?? null;
}

// The member list each record node carries when it declares a type rather than
// merely naming one.
const RECORD_BODY_TYPES: Partial<Record<string, string>> = {
  struct_specifier: "field_declaration_list",
  union_specifier: "field_declaration_list",
  class_specifier: "field_declaration_list",
  enum_specifier: "enumerator_list",
};

/**
 * Checks that a C/C++ record node declares a type instead of referring to one.
 *
 * `struct Point *p`, a `struct Point` parameter and a `struct Point start;`
 * field all parse to the same node type as the declaration itself, so the
 * member list is the only thing that separates a declaration from a mention.
 * Node types that are not records pass unconditionally.
 */
export function isRecordDefinition(node: Parser.SyntaxNode): boolean {
  const bodyType = RECORD_BODY_TYPES[node.type];
  if (bodyType === undefined) return true;

  return node.children.some((child) => child.type === bodyType);
}

/** Reads the class a qualified name belongs to, e.g. `Widget` from `outer::Widget::size`. */
function qualifierOf(name: string): string | null {
  const parts = name.split("::");
  return parts.length > 1 ? parts[parts.length - 2] : null;
}

/**
 * Drops out-of-line member definitions whose class is declared in the same file.
 *
 * `int Widget::size() const {}` defines a member the class body already lists,
 * so keeping it would count the member twice and would show a private member in
 * a view that filtered it out. A definition whose class is declared elsewhere
 * keeps its qualified name, which is the only name the file states.
 */
export function dropOutOfLineMembers(items: InventoryItem[]): InventoryItem[] {
  const classNames = new Set(
    items.filter((item) => item.type === "class").map((item) => item.name)
  );
  if (classNames.size === 0) return items;

  return items.filter((item) => {
    const qualifier = qualifierOf(item.name);
    return qualifier === null || !classNames.has(qualifier);
  });
}

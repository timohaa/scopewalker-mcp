import type Parser from "tree-sitter";
import type { InventoryItem } from "../types/index.js";

// Node types that can appear as the value of a const/let declarator and make it a function.
const FUNCTION_VALUE_TYPES = [
  "arrow_function",
  "function_expression",
  "function",
  "generator_function",
];

/** Checks whether a const/let declaration binds a function value (arrow or function expression). */
function hasFunctionInitializer(node: Parser.SyntaxNode): boolean {
  return node.children.some(
    (child) =>
      child.type === "variable_declarator" &&
      child.children.some((value) => FUNCTION_VALUE_TYPES.includes(value.type))
  );
}

/**
 * Classifies a Go `type X ...` declaration by the shape it names.
 * Struct types inventory as classes; interfaces and aliases as interfaces.
 */
function getGoTypeDeclarationKind(node: Parser.SyntaxNode): InventoryItem["type"] {
  const spec = node.children.find((c) => c.type === "type_spec" || c.type === "type_alias");
  const isStruct = spec?.children.some((c) => c.type === "struct_type") ?? false;
  return isStruct ? "class" : "interface";
}

const NODE_TYPE_MAP: Partial<Record<string, InventoryItem["type"]>> = {
  class_declaration: "class",
  class_definition: "class",
  class: "class",
  class_specifier: "class",
  // Records group fields and (in C++/Rust) behavior, so they inventory as classes.
  struct_specifier: "class",
  struct_item: "class",
  function_declaration: "function",
  function_definition: "function",
  function_item: "function",
  arrow_function: "function",
  interface_declaration: "interface",
  type_alias_declaration: "interface",
  trait_item: "interface",
  enum_declaration: "enum",
  enum_definition: "enum",
  enum_specifier: "enum",
  enum_item: "enum",
  const_declaration: "constant",
  variable_declaration: "constant",
};

/**
 * Detects functions that are really class members.
 * Python and C/C++ reuse function_definition for both, so only the parent
 * distinguishes them; members are already listed under their class.
 */
function isClassMember(node: Parser.SyntaxNode): boolean {
  if (node.type !== "function_definition") return false;

  const parent = node.parent;
  if (parent?.type === "field_declaration_list") return true;

  return parent?.type === "block" && parent.parent?.type === "class_definition";
}

/** Maps AST node types to inventory item types (class, function, interface, etc.). */
export function getItemType(node: Parser.SyntaxNode): InventoryItem["type"] | null {
  if (isClassMember(node)) return null;

  // TS/JS const/let: function-valued bindings are functions, plain values are
  // constants (consistent with how variable_declaration is treated).
  if (node.type === "lexical_declaration") {
    return hasFunctionInitializer(node) ? "function" : "constant";
  }

  // Go names its types indirectly, so the kind depends on the spec's child.
  if (node.type === "type_declaration") {
    return getGoTypeDeclarationKind(node);
  }

  const mapped = NODE_TYPE_MAP[node.type];
  if (mapped) return mapped;

  // Ruby has no distinct top-level function node type: "method"/"singleton_method"
  // covers both module-level defs and class members, distinguished only by parent.
  if (
    (node.type === "method" || node.type === "singleton_method") &&
    node.parent?.type !== "body_statement"
  ) {
    return "function";
  }

  return null;
}

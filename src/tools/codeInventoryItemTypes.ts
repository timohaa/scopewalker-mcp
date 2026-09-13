import type Parser from "tree-sitter";
import type { InventoryItem } from "../types/index.js";
import { isRecordDefinition } from "./codeInventoryCpp.js";
import { isRubyClassMember } from "./codeInventoryRuby.js";

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
  abstract_class_declaration: "class",
  // Records group fields and (in C++/Rust) behavior, so they inventory as classes.
  struct_specifier: "class",
  union_specifier: "class",
  struct_item: "class",
  record_declaration: "class",
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
  // Go names each constant on its own spec, so a grouped `const (...)` block
  // yields one item per spec rather than one for the whole declaration.
  const_spec: "constant",
  const_item: "constant",
  static_item: "constant",
  variable_declaration: "constant",
};

/**
 * Detects functions that are really class members.
 * Python and C/C++ reuse function_definition for both, so only the parent
 * distinguishes them; members are already listed under their class.
 */
function isClassMember(node: Parser.SyntaxNode): boolean {
  if (node.type !== "function_definition") return false;

  // A decorator wraps the def, so a decorated method sits one level further out.
  const parent = node.parent?.type === "decorated_definition" ? node.parent.parent : node.parent;
  if (parent?.type === "field_declaration_list") return true;

  return parent?.type === "block" && parent.parent?.type === "class_definition";
}

/**
 * Detects a Rust function declared inside a `trait` body.
 * Those are listed as members of the trait, so they must not also stand alone.
 */
function isTraitMember(node: Parser.SyntaxNode): boolean {
  if (node.type !== "function_item" && node.type !== "function_signature_item") return false;

  const list = node.parent;
  return list?.type === "declaration_list" && list.parent?.type === "trait_item";
}

/** Maps AST node types to inventory item types (class, function, interface, etc.). */
export function getItemType(node: Parser.SyntaxNode): InventoryItem["type"] | null {
  if (isClassMember(node) || isTraitMember(node)) return null;

  // A C/C++ record node names an existing type as often as it declares one.
  if (!isRecordDefinition(node)) return null;

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
  // covers both module-level defs and class members, distinguished only by scope.
  if (
    (node.type === "method" || node.type === "singleton_method") &&
    node.parent?.type !== "body_statement" &&
    !isRubyClassMember(node)
  ) {
    return "function";
  }

  return null;
}

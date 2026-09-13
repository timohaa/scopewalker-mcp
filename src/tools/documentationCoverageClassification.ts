import type Parser from "tree-sitter";

/**
 * Member lists of a type declaration, by grammar, with the declarations that may
 * own them. The owner check matters: Ruby gives a `def` body and a class body the
 * same node type, and Python gives a function body and a class body the same one.
 */
const RECORD_BODY_OWNERS: Record<string, string[] | undefined> = {
  // TS/JS/Java
  class_body: [
    "class_declaration",
    "abstract_class_declaration",
    "class",
    "class_definition",
    "interface_declaration",
    "enum_declaration",
    "record_declaration",
  ],
  // Java
  interface_body: ["interface_declaration"],
  enum_body: ["enum_declaration"],
  enum_body_declarations: ["enum_body"],
  annotation_type_body: ["annotation_type_declaration"],
  // Python
  block: ["class_definition"],
  // Ruby
  body_statement: ["class", "module", "singleton_class"],
  // C/C++
  field_declaration_list: ["struct_specifier", "class_specifier", "union_specifier"],
  // Rust
  declaration_list: ["trait_item"],
};

/** Nodes that end the search: below one of these the code is a body, not a member list. */
const FUNCTION_SCOPES = new Set([
  "function_declaration",
  "function_definition",
  "function_item",
  "function_expression",
  "arrow_function",
  "method_definition",
  "method_declaration",
  "lambda",
  "method",
  "singleton_method",
  "do_block",
]);

/** How far up the tree a member may sit from the body that owns it. */
const MAX_BODY_DEPTH = 12;

/** True when the node is the member list of a class, struct, module, or trait. */
function isRecordBody(node: Parser.SyntaxNode): boolean {
  const owners = RECORD_BODY_OWNERS[node.type];
  if (owners === undefined) return false;
  const parent = node.parent;
  return parent !== null && owners.includes(parent.type);
}

/**
 * True when the nearest enclosing body is a type's member list.
 *
 * The walk crosses plain statements so that a Ruby or Python `def` guarded by an
 * `if` inside a class body still counts as a member, and stops at the first
 * function scope so that a helper defined inside a method body does not.
 */
export function isInsideRecordBody(node: Parser.SyntaxNode): boolean {
  let current = node.parent;
  for (let depth = 0; current !== null && depth < MAX_BODY_DEPTH; depth++) {
    if (isRecordBody(current)) return true;
    if (FUNCTION_SCOPES.has(current.type)) return false;
    current = current.parent;
  }
  return false;
}

import type Parser from "tree-sitter";

/** Identifier node types that hold a function's name across the supported grammars. */
const NAME_NODE_TYPES = ["identifier", "property_identifier", "field_identifier"];

// C and C++ wrap the function_declarator in one node per level of indirection, so
// `struct Foo **make()` is pointer_declarator > pointer_declarator > function_declarator
// and `void (*fptr(int))(int)` adds a parenthesized_declarator. The name sits at the
// bottom of that chain, never among function_definition's direct children, which is
// why every pointer-returning C function used to be reported as <anonymous>.
const DECLARATOR_TYPES = [
  "function_declarator",
  "pointer_declarator",
  "reference_declarator", // C++ `int &f()` and `int &&f()`
  "parenthesized_declarator",
  "array_declarator",
  "attributed_declarator",
];

// A declarator names its function differently by context: free functions use
// `identifier`, in-class members `field_identifier`, out-of-line definitions
// `qualified_identifier` (`Widget::resize`), and C++ special members
// `destructor_name` (`~Widget`) or `operator_name` (`operator=`).
const DECLARATOR_NAME_TYPES = [
  "identifier",
  "field_identifier",
  "qualified_identifier",
  "destructor_name",
  "operator_name",
];

// Anonymous function forms that take their name from whatever binds them.
const ASSIGNED_NAME_TYPES = ["arrow_function", "function_expression", "generator_function"];

/**
 * Walks a C/C++ declarator chain down to the declared name.
 *
 * An abstract declarator (`int (*)(void) {}`) yields a zero-width identifier, so
 * the empty check keeps an empty string out of the results.
 */
function extractDeclaratorName(node: Parser.SyntaxNode): string | null {
  if (DECLARATOR_NAME_TYPES.includes(node.type) && node.text !== "") return node.text;
  if (!DECLARATOR_TYPES.includes(node.type)) return null;

  // The `declarator` field is the chain's own link wherever the grammar defines
  // one; reference_declarator and parenthesized_declarator do not, hence the scan.
  const declarator = node.childForFieldName("declarator");
  if (declarator !== null) {
    const name = extractDeclaratorName(declarator);
    if (name !== null) return name;
  }

  for (const child of node.namedChildren) {
    const name = extractDeclaratorName(child);
    if (name !== null) return name;
  }

  // The parameter list is never entered, so a parameter's own name cannot be
  // mistaken for the function's.
  return null;
}

/** Names an assignment target: a bare identifier, or the property in `exports.foo = ...`. */
function extractAssignmentTargetName(left: Parser.SyntaxNode | null): string | null {
  if (left === null) return null;
  if (left.type === "identifier") return left.text;
  if (left.type !== "member_expression") return null;

  const property = left.childForFieldName("property");
  return property !== null && NAME_NODE_TYPES.includes(property.type) ? property.text : null;
}

/**
 * Reads the name an anonymous TS/JS function is bound to.
 *
 * Only the immediate parent is consulted. A callback (`arr.map(x => x)`), an IIFE,
 * and an array element all sit under a node that binds no name, so they stay
 * anonymous instead of borrowing a name from further up the tree.
 */
function extractAssignedName(node: Parser.SyntaxNode): string | null {
  const parent = node.parent;
  if (parent === null) return null;

  if (parent.type === "variable_declarator" || parent.type === "public_field_definition") {
    const name = parent.childForFieldName("name");
    return name !== null && NAME_NODE_TYPES.includes(name.type) ? name.text : null;
  }

  if (parent.type === "pair") {
    const key = parent.childForFieldName("key");
    return key !== null && NAME_NODE_TYPES.includes(key.type) ? key.text : null;
  }

  if (parent.type === "assignment_expression") {
    return extractAssignmentTargetName(parent.childForFieldName("left"));
  }

  return null;
}

/**
 * Extracts a function node's name, or null when it has none.
 *
 * Shared by get_functions, get_complexity_metrics, and get_prop_drilling: kept
 * separate copies had drifted, so the same C function was named in one tool and
 * `<anonymous>` in another.
 */
export function extractFunctionName(node: Parser.SyntaxNode): string | null {
  if (node.type === "function_definition") {
    // Python shares the node name but has no declarator, so only C/C++ take this
    // path. Checked first because a C++ return type can itself be a qualified_identifier.
    const declarator = node.childForFieldName("declarator");
    if (declarator !== null) return extractDeclaratorName(declarator);
  }

  // Every function node in the nine supported grammars either carries a `name`
  // field or is one of the anonymous forms below, so no positional identifier
  // scan is needed — and a scan is what used to mistake an arrow's parameter for
  // its name.
  const nameField = node.childForFieldName("name");
  if (nameField !== null) return nameField.text;

  return ASSIGNED_NAME_TYPES.includes(node.type) ? extractAssignedName(node) : null;
}

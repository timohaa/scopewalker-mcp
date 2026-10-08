import type Parser from "tree-sitter";
import { DECLARATOR_NAME_TYPES } from "../lib/functionNames.js";
import { isInsideRecordBody } from "./documentationCoverageClassification.js";

export interface DocumentableNode {
  name: string;
  type: "function" | "class" | "method";
  lineCount: number;
}

const FUNC_TYPES = [
  "function_declaration",
  "function_definition",
  "function_item",
  "function_expression",
];

const CLASS_TYPES = [
  "class_declaration",
  "abstract_class_declaration",
  "class_definition",
  "class",
];

// C/C++ name a record by its keyword, and use the same node for a bare type
// reference (`struct CPU_pins *pins;`), so only a member list makes one a class.
const C_RECORD_TYPES = ["class_specifier", "struct_specifier", "union_specifier", "enum_specifier"];
const C_RECORD_BODIES = ["field_declaration_list", "enumerator_list"];

const METHOD_TYPES = ["method_definition", "method_declaration", "abstract_method_signature"];

// Ruby has no distinct top-level function node type: these cover both
// module-level defs and class members, distinguished only by parent.
const RUBY_DEF_TYPES = ["method", "singleton_method"];

// Go declares an interface's methods, and Rust a trait's, without a body.
const GO_INTERFACE_METHOD_TYPES = ["method_elem", "method_spec"];

type DocumentableType = "function" | "class" | "method";

/** Nodes that hold a C/C++ record as a statement or member, ending the climb below. */
const C_RECORD_CONTAINERS = ["compound_statement", "field_declaration_list", "declaration_list"];

/**
 * True for a record tree-sitter parsed as a function's return type. A macro or a
 * multi-line template parameter list can derail the parse, so fmt's
 * `class basic_memory_buffer` became a function_definition whose doc comment
 * sits out of reach above the `template` line.
 */
function isRecordInReturnType(node: Parser.SyntaxNode): boolean {
  for (let current = node.parent; current !== null; current = current.parent) {
    if (C_RECORD_CONTAINERS.includes(current.type)) return false;
    if (current.type === "function_definition") return true;
  }
  return false;
}

/** True for a C/C++ record that declares members, not one that only names a type. */
function isDefinedRecord(node: Parser.SyntaxNode): boolean {
  if (isRecordInReturnType(node)) return false;
  return node.children.some((child) => C_RECORD_BODIES.includes(child.type));
}

/** True for a TS class field whose value is a function (`handleClick = () => {}`). */
function isFunctionValuedField(node: Parser.SyntaxNode): boolean {
  return node.children.some(
    (child) => child.type === "arrow_function" || child.type === "function_expression"
  );
}

/**
 * Classifies a plain function/method node by whether it sits inside a record
 * body, plus C/C++ prototypes, which are functions regardless of enclosure.
 * Ruby module bodies count as record bodies here, so their defs are methods.
 */
function classifyFunctionOrPrototype(node: Parser.SyntaxNode): DocumentableType | null {
  if (RUBY_DEF_TYPES.includes(node.type) || FUNC_TYPES.includes(node.type)) {
    return isInsideRecordBody(node) ? "method" : "function";
  }

  // C/C++ prototypes. Inside a class body these are members: constructors,
  // destructors, and member templates parse as `declaration`, not `field_declaration`.
  if (node.type === "declaration" && hasFunctionDeclarator(node)) {
    return isInsideRecordBody(node) ? "method" : "function";
  }

  return null;
}

/**
 * Classifies field and signature nodes whose "member-ness" depends on their
 * enclosing declaration list rather than the node's own type.
 */
function classifyFieldOrSignature(node: Parser.SyntaxNode): DocumentableType | null {
  if (node.type === "field_declaration") {
    return node.parent?.type === "field_declaration_list" && hasFunctionDeclarator(node)
      ? "method"
      : null;
  }

  if (node.type === "public_field_definition") {
    return isFunctionValuedField(node) ? "method" : null;
  }

  // Rust trait method signatures; the same node in an `extern` block is a
  // foreign function, which this tool does not report.
  if (node.type === "function_signature_item") {
    return isInsideRecordBody(node) ? "method" : null;
  }

  if (GO_INTERFACE_METHOD_TYPES.includes(node.type)) {
    return node.parent?.type === "interface_type" ? "method" : null;
  }

  return null;
}

/**
 * Classifies the node types whose meaning depends on what encloses them.
 * Ruby has no distinct method node, and C/C++ members share their node types
 * with free functions and data fields, so in both cases only the enclosing
 * declaration separates a method from a plain function.
 */
function classifyByParent(node: Parser.SyntaxNode): DocumentableType | null {
  return classifyFunctionOrPrototype(node) ?? classifyFieldOrSignature(node);
}

/** Classifies a node as function, class, or method, or null if not documentable. */
function getDocumentableType(node: Parser.SyntaxNode): DocumentableType | null {
  if (CLASS_TYPES.includes(node.type)) return "class";
  if (C_RECORD_TYPES.includes(node.type)) return isDefinedRecord(node) ? "class" : null;
  if (METHOD_TYPES.includes(node.type)) return "method";

  return classifyByParent(node);
}

/** C++ function bodies that replace the body with `= default` or `= delete`. */
const SPECIAL_METHOD_CLAUSES = ["default_method_clause", "delete_method_clause"];

/** True for `template <>`, an explicit specialisation of a template declared elsewhere. */
function isExplicitSpecialization(node: Parser.SyntaxNode): boolean {
  let parent = node.parent;
  while (parent?.type === "template_declaration") {
    const params = parent.childForFieldName("parameters");
    if (params !== null && params.namedChildCount === 0) return true;
    parent = parent.parent;
  }
  return false;
}

/**
 * True for C++ declarations that need no doc comment of their own: a `friend`
 * grants access to a function declared elsewhere, a defaulted or deleted
 * member has compiler-defined behaviour, and an explicit specialisation is
 * documented by its primary template.
 */
function isExemptCppDeclaration(node: Parser.SyntaxNode): boolean {
  if (node.parent?.type === "friend_declaration") return true;
  if (node.children.some((child) => SPECIAL_METHOD_CLAUSES.includes(child.type))) return true;
  return isExplicitSpecialization(node);
}

/** Returns documentable info if node is a function, class, or method. */
export function getDocumentableNode(node: Parser.SyntaxNode): DocumentableNode | null {
  if (node.type === "arrow_function") {
    return getNamedArrowFunction(node);
  }
  if (isExemptCppDeclaration(node)) return null;

  const type = getDocumentableType(node);
  if (type === null) return null;

  const name = extractName(node);
  if (name === null) return null;

  const lineCount = node.endPosition.row - node.startPosition.row + 1;

  return { name, type, lineCount };
}

/**
 * Returns a documentable item for an arrow function only when it is bound to a name
 * (e.g. `const fn = () => {}`). Inline callback arrows (`items.map(item => item.id)`)
 * are not documentable and must not be counted.
 */
function getNamedArrowFunction(node: Parser.SyntaxNode): DocumentableNode | null {
  const parent = node.parent;
  if (parent?.type !== "variable_declarator") return null;

  const name = extractName(parent);
  if (name === null) return null;

  const lineCount = node.endPosition.row - node.startPosition.row + 1;
  return { name, type: "function", lineCount };
}

// Declarators that wrap a function's declarator without changing what it
// declares: `T *f()`, `T &f()`, and `T f [[nodiscard]] ()`.
const C_DECLARATOR_WRAPPERS = [
  "pointer_declarator",
  "reference_declarator",
  "attributed_declarator",
];

/**
 * Finds the function_declarator a C/C++ declaration declares, or null.
 * A parenthesized declarator (`void (*fp)(int)`) declares a function pointer
 * variable, so the walk stops there instead of naming the variable.
 */
function findFunctionDeclarator(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
  let current = node.childForFieldName("declarator");
  while (current !== null) {
    if (current.type === "function_declarator") return current;
    if (!C_DECLARATOR_WRAPPERS.includes(current.type)) return null;
    current =
      current.childForFieldName("declarator") ??
      current.namedChildren.find((child) => child.type.endsWith("declarator")) ??
      null;
  }
  return null;
}

/** Reads the name a C/C++ function declarator declares, or null for anything else. */
function getCFunctionName(node: Parser.SyntaxNode): string | null {
  const name = findFunctionDeclarator(node)?.childForFieldName("declarator");
  if (!name || !DECLARATOR_NAME_TYPES.includes(name.type) || name.text === "") return null;
  return name.text;
}

/** Checks if a C/C++ declaration node declares a function (i.e., is a prototype). */
function hasFunctionDeclarator(node: Parser.SyntaxNode): boolean {
  return getCFunctionName(node) !== null;
}

// C/C++ node types whose name lives inside a declarator rather than a direct child.
const C_DECLARATOR_HOLDERS = ["declaration", "field_declaration", "function_definition"];

/** Extracts name from identifier children of a node. */
export function extractName(node: Parser.SyntaxNode): string | null {
  // A grammar's own `name` field is authoritative where it exists. Go names
  // methods with a field_identifier the scan below rejects, so `func (p *Point)
  // Name() string` used to yield the return type and `Reset()` nothing at all.
  // C/C++ declare no `name` field, leaving the declarator path below in charge.
  const nameField = node.childForFieldName("name");
  if (nameField) return nameField.text;

  // C/C++ nest the name inside declarators for prototypes (`declaration`,
  // `field_declaration`) and bodies (`function_definition`) alike. Returning here
  // keeps the identifier scan below from naming a function after its return type
  // (`Point make()`). Python's function_definition has no declarator.
  if (C_DECLARATOR_HOLDERS.includes(node.type) && node.childForFieldName("declarator")) {
    return getCFunctionName(node);
  }

  for (const child of node.children) {
    if (
      child.type === "identifier" ||
      child.type === "property_identifier" ||
      child.type === "type_identifier" ||
      child.type === "constant" // Ruby class/module names
    ) {
      return child.text;
    }
  }

  return null;
}

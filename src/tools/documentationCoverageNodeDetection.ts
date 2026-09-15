import type Parser from "tree-sitter";
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

/** True for a C/C++ record that declares members, not one that only names a type. */
function isDefinedRecord(node: Parser.SyntaxNode): boolean {
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

  // C/C++ function declarations in headers (prototypes)
  if (node.type === "declaration" && hasFunctionDeclarator(node)) return "function";

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

/** Returns documentable info if node is a function, class, or method. */
export function getDocumentableNode(node: Parser.SyntaxNode): DocumentableNode | null {
  if (node.type === "arrow_function") {
    return getNamedArrowFunction(node);
  }

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

/** Checks if a C/C++ declaration node contains a function declarator (i.e., is a function prototype). */
function hasFunctionDeclarator(node: Parser.SyntaxNode): boolean {
  for (const child of node.children) {
    if (child.type === "function_declarator") {
      return true;
    }
    // Handle pointer return types: void *func() has pointer_declarator containing function_declarator
    if (child.type === "pointer_declarator" && hasFunctionDeclarator(child)) {
      return true;
    }
  }
  return false;
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
  // `field_declaration`) and bodies (`function_definition`) alike. This runs
  // before the identifier scan because a class-typed return value (`Point
  // make()`) puts a type_identifier ahead of the declarator.
  if (C_DECLARATOR_HOLDERS.includes(node.type)) {
    const declaredName = extractNameFromCDeclaration(node);
    if (declaredName !== null) return declaredName;
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

// A declarator names its function differently by context: free functions use
// `identifier`, out-of-line definitions `qualified_identifier` (`Widget::resize`),
// and in-class members `field_identifier`.
const DECLARATOR_NAME_TYPES = ["identifier", "qualified_identifier", "field_identifier"];

/** Extracts identifier from a function_declarator node. */
function getIdentifierFromFunctionDeclarator(node: Parser.SyntaxNode): string | null {
  const identifier = node.children.find((c) => DECLARATOR_NAME_TYPES.includes(c.type));
  return identifier?.text ?? null;
}

/**
 * Finds a function_declarator within a pointer_declarator and extracts its name.
 * Each `*` of a `struct Foo **make(void)` adds another pointer_declarator level.
 */
function getNameFromPointerDeclarator(pointerDecl: Parser.SyntaxNode): string | null {
  for (const child of pointerDecl.children) {
    if (child.type === "function_declarator") {
      return getIdentifierFromFunctionDeclarator(child);
    }
    if (child.type === "pointer_declarator") {
      const name = getNameFromPointerDeclarator(child);
      if (name !== null) return name;
    }
  }
  return null;
}

/**
 * Extracts function name from C/C++ declaration nodes.
 * Handles both direct function_declarator and pointer_declarator wrapping function_declarator.
 */
function extractNameFromCDeclaration(node: Parser.SyntaxNode): string | null {
  for (const child of node.children) {
    if (child.type === "function_declarator") {
      return getIdentifierFromFunctionDeclarator(child);
    }
    if (child.type === "pointer_declarator") {
      const name = getNameFromPointerDeclarator(child);
      if (name !== null) return name;
    }
  }
  return null;
}

import type Parser from "tree-sitter";

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

// C/C++ record bodies are documentable classes; the grammar names them by keyword.
const CLASS_TYPES = [
  "class_declaration",
  "class_definition",
  "class",
  "class_specifier",
  "struct_specifier",
];

const METHOD_TYPES = ["method_definition", "method_declaration"];

// Ruby has no distinct top-level function node type: these cover both
// module-level defs and class members, distinguished only by parent.
const RUBY_DEF_TYPES = ["method", "singleton_method"];

/** Classifies a node as function, class, or method, or null if not documentable. */
function getDocumentableType(node: Parser.SyntaxNode): "function" | "class" | "method" | null {
  if (CLASS_TYPES.includes(node.type)) return "class";
  if (METHOD_TYPES.includes(node.type)) return "method";

  // Mirrors the parent check in getItemType so both tools label a Ruby def the same way.
  if (RUBY_DEF_TYPES.includes(node.type)) {
    return node.parent?.type === "body_statement" ? "method" : "function";
  }

  // C/C++ members share their node types with free functions and data fields,
  // so the enclosing record body is what marks them as methods.
  const inRecordBody = node.parent?.type === "field_declaration_list";
  if (node.type === "field_declaration") {
    return inRecordBody && hasFunctionDeclarator(node) ? "method" : null;
  }
  if (FUNC_TYPES.includes(node.type)) {
    return inRecordBody ? "method" : "function";
  }

  // C/C++ function declarations in headers (prototypes)
  if (node.type === "declaration" && hasFunctionDeclarator(node)) return "function";

  return null;
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
    if (child.type === "pointer_declarator") {
      for (const grandchild of child.children) {
        if (grandchild.type === "function_declarator") {
          return true;
        }
      }
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

/** Finds a function_declarator within a pointer_declarator and extracts its name. */
function getNameFromPointerDeclarator(pointerDecl: Parser.SyntaxNode): string | null {
  const funcDecl = pointerDecl.children.find((c) => c.type === "function_declarator");
  return funcDecl ? getIdentifierFromFunctionDeclarator(funcDecl) : null;
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

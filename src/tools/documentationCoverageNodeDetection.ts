import type Parser from "tree-sitter";

export interface DocumentableNode {
  name: string;
  type: "function" | "class" | "method";
  lineCount: number;
}

/** Returns documentable info if node is a function, class, or method. */
export function getDocumentableNode(node: Parser.SyntaxNode): DocumentableNode | null {
  const funcTypes = [
    "function_declaration",
    "function_definition",
    "function_item",
    "arrow_function",
    "function_expression",
  ];

  const classTypes = ["class_declaration", "class_definition", "class"];
  const methodTypes = ["method_definition", "method_declaration", "method", "singleton_method"];

  let type: "function" | "class" | "method" | null = null;

  if (funcTypes.includes(node.type)) {
    type = "function";
  } else if (classTypes.includes(node.type)) {
    type = "class";
  } else if (methodTypes.includes(node.type)) {
    type = "method";
  } else if (node.type === "declaration" && hasFunctionDeclarator(node)) {
    // C/C++ function declarations in headers (prototypes)
    type = "function";
  }

  if (type === null) return null;

  const name = extractName(node);
  if (name === null) return null;

  const lineCount = node.endPosition.row - node.startPosition.row + 1;

  return { name, type, lineCount };
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

/** Extracts name from identifier children of a node. */
export function extractName(node: Parser.SyntaxNode): string | null {
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

  // For C/C++ declarations, the name is nested inside declarators
  if (node.type === "declaration") {
    return extractNameFromCDeclaration(node);
  }

  return null;
}

/** Extracts identifier from a function_declarator node. */
function getIdentifierFromFunctionDeclarator(node: Parser.SyntaxNode): string | null {
  const identifier = node.children.find((c) => c.type === "identifier");
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

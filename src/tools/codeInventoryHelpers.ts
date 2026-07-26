import type Parser from "tree-sitter";
import { walkNode } from "../lib/astWalker.js";
export { walkNode };
import type {
  CodeInventoryResult,
  FileInventory,
  InventoryItem,
  MethodInfo,
  SupportedLanguage,
} from "../types/index.js";

/** Extracts an inventory item from an AST node if it represents a class, function, etc. */
export function extractItem(
  node: Parser.SyntaxNode,
  language: SupportedLanguage,
  includePrivate: boolean
): InventoryItem | null {
  const type = getItemType(node);
  if (type === null) return null;

  const name = extractName(node);
  if (name === null) return null;

  const isPrivate = isPrivateSymbol(name, node, language);
  if (isPrivate && !includePrivate) return null;

  const exported = isExported(node, language);
  const line = node.startPosition.row + 1;

  const item: InventoryItem = {
    name,
    type,
    line,
    exported,
  };

  if (type === "class") {
    const methods = extractMethods(node, language, includePrivate);
    if (methods.length > 0) {
      item.methods = methods;
    }
  }

  return item;
}

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

/** Maps AST node types to inventory item types (class, function, interface, etc.). */
export function getItemType(node: Parser.SyntaxNode): InventoryItem["type"] | null {
  // Python defs directly inside a class body are methods of that class, not
  // standalone functions (analogous to the Ruby guard below).
  if (
    node.type === "function_definition" &&
    node.parent?.type === "block" &&
    node.parent.parent?.type === "class_definition"
  ) {
    return null;
  }

  // TS/JS const/let: function-valued bindings are functions, plain values are
  // constants (consistent with how variable_declaration is treated).
  if (node.type === "lexical_declaration") {
    return hasFunctionInitializer(node) ? "function" : "constant";
  }

  const typeMap: Partial<Record<string, InventoryItem["type"]>> = {
    class_declaration: "class",
    class_definition: "class",
    class: "class",
    function_declaration: "function",
    function_definition: "function",
    function_item: "function",
    arrow_function: "function",
    interface_declaration: "interface",
    type_alias_declaration: "interface",
    enum_declaration: "enum",
    enum_definition: "enum",
    const_declaration: "constant",
    variable_declaration: "constant",
  };

  const mapped = typeMap[node.type];
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

// "constant" covers Ruby class/module names, which use a distinct node type from other languages.
const IDENTIFIER_TYPES = ["identifier", "type_identifier", "property_identifier", "constant"];

/** Checks if a node is one of the identifier types that can hold a symbol name. */
function isIdentifierNode(node: Parser.SyntaxNode): boolean {
  return IDENTIFIER_TYPES.includes(node.type);
}

/** Extracts the identifier name from a variable_declarator node. */
function extractIdentifierFromDeclarator(declarator: Parser.SyntaxNode): string | null {
  const identifier = declarator.children.find((child) => child.type === "identifier");
  return identifier?.text ?? null;
}

/** Extracts the function name from a C/C++ function_declarator node. */
function extractIdentifierFromFunctionDeclarator(declarator: Parser.SyntaxNode): string | null {
  for (const child of declarator.children) {
    if (child.type === "identifier" || child.type === "qualified_identifier") {
      return child.text;
    }
  }
  return null;
}

/** Extracts the name identifier from a declaration node. */
export function extractName(node: Parser.SyntaxNode): string | null {
  for (const child of node.children) {
    if (isIdentifierNode(child)) {
      return child.text;
    }
    if (child.type === "variable_declarator") {
      return extractIdentifierFromDeclarator(child);
    }
    if (child.type === "function_declarator") {
      return extractIdentifierFromFunctionDeclarator(child);
    }
  }
  return null;
}

/** Determines if a symbol is private based on naming conventions or access modifiers. */
export function isPrivateSymbol(
  name: string,
  node: Parser.SyntaxNode,
  language: SupportedLanguage
): boolean {
  if (name.startsWith("_")) return true;

  if (language === "typescript" || language === "javascript") {
    for (const child of node.children) {
      if (child.type === "accessibility_modifier" && child.text === "private") {
        return true;
      }
    }
  }

  return false;
}

/** Checks if a node is exported based on parent context or export keywords. */
export function isExported(node: Parser.SyntaxNode, language: SupportedLanguage): boolean {
  const parent = node.parent;
  if (!parent) return false;

  if (
    parent.type === "export_statement" ||
    parent.type === "export_declaration" ||
    parent.type === "named_exports"
  ) {
    return true;
  }

  for (const child of node.children) {
    if (child.text === "export") return true;
  }

  if (language === "python") {
    return parent.type === "module";
  }

  return false;
}

// Node types that hold a class's direct member list, per language grammar
// (TS/JS/Java: class_body, Python: block, Ruby: body_statement).
const CLASS_BODY_TYPES = ["class_body", "block", "body_statement"];

/**
 * Extracts method definitions from a class node.
 * Only direct class-body children count; defs nested inside method bodies do not.
 */
export function extractMethods(
  classNode: Parser.SyntaxNode,
  language: SupportedLanguage,
  includePrivate: boolean
): MethodInfo[] {
  const body = classNode.children.find((child) => CLASS_BODY_TYPES.includes(child.type));
  if (!body) return [];

  const methods: MethodInfo[] = [];
  for (const node of body.children) {
    if (!isMethodNode(node)) continue;

    const name = extractMethodName(node);
    if (name === null) continue;

    const isPrivate = isPrivateSymbol(name, node, language);
    if (isPrivate && !includePrivate) continue;

    methods.push({
      name,
      line: node.startPosition.row + 1,
      visibility: isPrivate ? "private" : "public",
    });
  }

  return methods;
}

/** Checks if an AST node represents a method definition. */
export function isMethodNode(node: Parser.SyntaxNode): boolean {
  const methodTypes = [
    "method_definition",
    "method_declaration",
    "function_definition",
    "public_method_definition",
    "method",
    "singleton_method",
  ];
  return methodTypes.includes(node.type);
}

/** Extracts the method name from a method definition node. */
export function extractMethodName(node: Parser.SyntaxNode): string | null {
  for (const child of node.children) {
    if (
      child.type === "identifier" ||
      child.type === "property_identifier" ||
      child.type === "field_identifier"
    ) {
      return child.text;
    }
  }
  return null;
}

interface InventoryCounts {
  classes: number;
  functions: number;
  methods: number;
  exported: number;
}

/** Increments the appropriate counters based on item type. */
function countItem(item: InventoryItem, counts: InventoryCounts): void {
  if (item.exported) counts.exported++;

  if (item.type === "class") {
    counts.classes++;
    counts.methods += item.methods?.length ?? 0;
  } else if (item.type === "function") {
    counts.functions++;
  }
}

/** Aggregates inventory items into summary statistics. */
export function calculateSummary(inventory: FileInventory[]): CodeInventoryResult["summary"] {
  const counts: InventoryCounts = { classes: 0, functions: 0, methods: 0, exported: 0 };

  const allItems = inventory.flatMap((file) => file.items);
  for (const item of allItems) {
    countItem(item, counts);
  }

  return {
    total_files: inventory.length,
    total_classes: counts.classes,
    total_functions: counts.functions,
    total_methods: counts.methods,
    exported_symbols: counts.exported,
  };
}

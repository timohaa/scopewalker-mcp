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
import { getItemType } from "./codeInventoryItemTypes.js";
export { getItemType };
import { isExported, isPrivateSymbol } from "./codeInventoryVisibility.js";
export { isExported, isPrivateSymbol };

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

  const exported = isExported(name, node, language);
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

// A declarator names its function differently by context: free functions use
// `identifier`, out-of-line definitions `qualified_identifier` (`Widget::resize`),
// and in-class members `field_identifier`.
const DECLARATOR_NAME_TYPES = ["identifier", "qualified_identifier", "field_identifier"];

/** Extracts the function name from a C/C++ function_declarator node. */
function extractIdentifierFromFunctionDeclarator(declarator: Parser.SyntaxNode): string | null {
  const name = declarator.children.find((child) => DECLARATOR_NAME_TYPES.includes(child.type));
  return name?.text ?? null;
}

/** Extracts the name identifier from a declaration node. */
export function extractName(node: Parser.SyntaxNode): string | null {
  // Arrow functions are anonymous: an identifier child is an unparenthesized
  // parameter (`x => ...`) or expression body, never the function's name.
  // Named arrows are inventoried via their enclosing lexical_declaration.
  if (node.type === "arrow_function") {
    return null;
  }

  // Checked ahead of the identifier scan because a class-typed return value
  // (`Point make()`) puts a type_identifier before the declarator.
  const declarator = node.children.find((child) => child.type === "function_declarator");
  if (declarator) {
    return extractIdentifierFromFunctionDeclarator(declarator);
  }

  for (const child of node.children) {
    if (isIdentifierNode(child)) {
      return child.text;
    }
    if (child.type === "variable_declarator") {
      return extractIdentifierFromDeclarator(child);
    }
    // Go wraps the type name one level down, in a type_spec or type_alias.
    if (child.type === "type_spec" || child.type === "type_alias") {
      return extractName(child);
    }
  }
  return null;
}

// Node types that hold a class's direct member list, per language grammar
// (TS/JS/Java: class_body, Python: block, Ruby: body_statement,
// C/C++/Rust: field_declaration_list).
const CLASS_BODY_TYPES = ["class_body", "block", "body_statement", "field_declaration_list"];

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
  if (methodTypes.includes(node.type)) return true;

  // C/C++ members declared without a body share a node type with data fields,
  // so only those carrying a function_declarator are methods.
  return (
    node.type === "field_declaration" &&
    node.children.some((child) => child.type === "function_declarator")
  );
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
    // C/C++ nest the member name inside its declarator.
    if (child.type === "function_declarator") {
      return extractIdentifierFromFunctionDeclarator(child);
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

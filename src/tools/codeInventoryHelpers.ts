import type Parser from "tree-sitter";
import { walkNode } from "../lib/astWalker.js";
export { walkNode };
import type {
  CodeInventoryResult,
  FileInventory,
  InventoryItem,
  MethodInfo,
  MethodVisibility,
  SupportedLanguage,
} from "../types/index.js";
import { extractDeclaratorName, findFunctionDeclarator } from "./codeInventoryCpp.js";
import { getItemType } from "./codeInventoryItemTypes.js";
export { getItemType };
import { bodyMembers, extractMethodName, isMethodNode } from "./codeInventoryMembers.js";
export { extractMethodName, isMethodNode };
import {
  defaultSectionVisibility,
  readInlineVisibilityCall,
  readRetroactiveMarks,
  readSectionMarker,
} from "./codeInventoryMemberVisibility.js";
import { getJavaAccessModifier, isExported, isPrivateSymbol } from "./codeInventoryVisibility.js";
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

  // A Rust trait is the one interface whose members the grammar nests in a body.
  if (type === "class" || type === "interface") {
    const methods = extractMethods(node, language, includePrivate);
    if (methods.length > 0) {
      item.methods = methods;
    }
  }

  return item;
}

// "constant" covers Ruby class/module names, which use a distinct node type from
// other languages; "scope_resolution" covers its compact form, `class A::B::E`.
// "operator" and "setter" name a Ruby `def ==` and a `def name=`.
const IDENTIFIER_TYPES = [
  "identifier",
  "type_identifier",
  "property_identifier",
  "constant",
  "scope_resolution",
  "operator",
  "setter",
];

/** Checks if a node is one of the identifier types that can hold a symbol name. */
function isIdentifierNode(node: Parser.SyntaxNode): boolean {
  return IDENTIFIER_TYPES.includes(node.type);
}

/** Extracts the identifier name from a variable_declarator node. */
function extractIdentifierFromDeclarator(declarator: Parser.SyntaxNode): string | null {
  const identifier = declarator.children.find((child) => child.type === "identifier");
  return identifier?.text ?? null;
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
  const declarator = findFunctionDeclarator(node);
  if (declarator) {
    return extractDeclaratorName(declarator);
  }

  for (const child of node.children) {
    if (isIdentifierNode(child)) {
      return child.text;
    }
    if (child.type === "variable_declarator") {
      return extractIdentifierFromDeclarator(child);
    }
  }
  return null;
}

// Node types that hold a class's direct member list, per language grammar
// (TS/JS/Java: class_body, Python: block, Ruby: body_statement,
// C/C++/Rust: field_declaration_list, Rust trait: declaration_list).
const CLASS_BODY_TYPES = [
  "class_body",
  "block",
  "body_statement",
  "field_declaration_list",
  "declaration_list",
];

/** Adds a named method to the inventory with its effective visibility. */
function recordMethod(
  methods: MethodInfo[],
  node: Parser.SyntaxNode,
  language: SupportedLanguage,
  visibility: MethodVisibility
): void {
  const name = extractMethodName(node);
  if (name === null) return;

  methods.push({
    name,
    line: node.startPosition.row + 1,
    // A naming convention still applies on top of the declared visibility: an
    // underscore-prefixed Ruby or Python method is private wherever it sits.
    visibility: isPrivateSymbol(name, node, language) ? "private" : visibility,
  });
}

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
  const retroactive = new Map<string, MethodVisibility>();
  let section = defaultSectionVisibility(classNode, language);

  for (const node of bodyMembers(body, language)) {
    const marker = readSectionMarker(node, language);
    if (marker) {
      section = marker;
      continue;
    }

    const marks = readRetroactiveMarks(node, language);
    if (marks) {
      for (const name of marks.names) retroactive.set(name, marks.visibility);
      continue;
    }

    const inlined = readInlineVisibilityCall(node, language);
    if (inlined.length > 0) {
      for (const { methodNode, visibility } of inlined) {
        recordMethod(methods, methodNode, language, visibility);
      }
      continue;
    }

    if (isMethodNode(node)) {
      recordMethod(methods, node, language, memberVisibility(node, language, section));
    }
  }

  // `private :a` trails the definition it names, so filtering can only happen
  // once the whole body has been read.
  const resolved = methods.map((method) => ({
    ...method,
    visibility: retroactive.get(method.name) ?? method.visibility,
  }));

  return includePrivate ? resolved : resolved.filter((m) => m.visibility !== "private");
}

/** A per-declaration access modifier overrides the section it sits in; otherwise the section stands. */
function memberVisibility(
  node: Parser.SyntaxNode,
  language: SupportedLanguage,
  section: MethodVisibility
): MethodVisibility {
  if (language === "java") return getJavaAccessModifier(node) ?? "private";

  if (language === "typescript" || language === "javascript") {
    // A `#name` field is private to the language itself, whatever else is declared.
    if (node.children.some((child) => child.type === "private_property_identifier")) {
      return "private";
    }

    const modifier = node.children.find((child) => child.type === "accessibility_modifier");
    return (modifier?.text as MethodVisibility | undefined) ?? section;
  }

  return section;
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
  counts.methods += item.methods?.length ?? 0;

  if (item.type === "class") {
    counts.classes++;
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

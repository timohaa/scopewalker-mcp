import type Parser from "tree-sitter";
import type { SupportedLanguage } from "../types/index.js";
import { parseCode } from "./treeSitter.js";

// Only top-level import nodes are counted (not nested clauses like import_spec)
const IMPORT_NODE_TYPES: Record<SupportedLanguage, string[]> = {
  typescript: ["import_statement", "call_expression"],
  javascript: ["import_statement", "call_expression"],
  python: ["import_statement", "import_from_statement"],
  go: ["import_declaration"],
  rust: ["use_declaration"],
  java: ["import_declaration"],
  c: ["preproc_include"],
  cpp: ["preproc_include"],
  ruby: ["call"], // require/require_relative calls
};

/**
 * Counts import/dependency statements using AST analysis.
 * More accurate than regex-based counting as it handles comments,
 * string contents, and language-specific import syntax properly.
 */
export async function countImports(code: string, language: SupportedLanguage): Promise<number> {
  const tree = await parseCode(code, language);
  if (tree === null) {
    return 0;
  }

  const importTypes = IMPORT_NODE_TYPES[language];
  let count = 0;

  walkTreeForImports(tree.rootNode, language, importTypes, () => {
    count++;
  });

  return count;
}

/** Checks if a JS/TS call_expression is a require() call. */
function isRequireCall(node: Parser.SyntaxNode): boolean {
  const callee = node.children.find((c) => c.type === "identifier");
  return callee?.text === "require";
}

/** Checks if a Ruby call is a require/require_relative call. */
function isRubyRequireCall(node: Parser.SyntaxNode): boolean {
  const method = node.children.find((c) => c.type === "identifier");
  return method?.text === "require" || method?.text === "require_relative";
}

/** Extracts import_spec nodes from an import_spec_list. */
function getImportSpecsFromList(listNode: Parser.SyntaxNode): Parser.SyntaxNode[] {
  return listNode.children.filter((spec) => spec.type === "import_spec");
}

/** Processes Go import_declaration by counting individual import_spec nodes. */
function processGoImportDeclaration(
  node: Parser.SyntaxNode,
  callback: (node: Parser.SyntaxNode) => void
): void {
  for (const child of node.children) {
    if (child.type === "import_spec") {
      callback(child);
    } else if (child.type === "import_spec_list") {
      getImportSpecsFromList(child).forEach(callback);
    }
  }
}

/**
 * Checks if node is an import and invokes callback if so.
 * Returns true if node was handled (to skip further recursion for Go imports).
 */
function processImportNode(
  node: Parser.SyntaxNode,
  language: SupportedLanguage,
  importTypes: string[],
  callback: (node: Parser.SyntaxNode) => void
): boolean {
  if (!importTypes.includes(node.type)) {
    return false;
  }

  if (node.type === "call_expression") {
    if (isRequireCall(node)) callback(node);
  } else if (node.type === "call" && language === "ruby") {
    if (isRubyRequireCall(node)) callback(node);
  } else if (node.type === "import_declaration") {
    processGoImportDeclaration(node, callback);
    return true; // Skip recursion for Go imports
  } else {
    callback(node);
  }

  return false;
}

/**
 * Traverses AST to find and count import nodes.
 * Handles language-specific patterns like require() calls in JS/TS.
 */
function walkTreeForImports(
  node: Parser.SyntaxNode,
  language: SupportedLanguage,
  importTypes: string[],
  callback: (node: Parser.SyntaxNode) => void
): void {
  const skipRecursion = processImportNode(node, language, importTypes, callback);
  if (skipRecursion) return;

  for (const child of node.children) {
    walkTreeForImports(child, language, importTypes, callback);
  }
}

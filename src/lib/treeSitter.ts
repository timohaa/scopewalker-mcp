import { extname } from "node:path";
import Parser from "tree-sitter";
import type { SupportedLanguage } from "../types/index.js";
import { loadGrammar } from "./treeSitterGrammars.js";

// Re-export from split modules for backwards compatibility
export { countImports } from "./treeSitterImports.js";
export { getComments, type CommentInfo } from "./treeSitterComments.js";

const parsers = new Map<SupportedLanguage, Parser>();

const EXTENSION_MAP: Record<string, SupportedLanguage> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".rb": "ruby",
};

const FUNCTION_QUERIES: Record<SupportedLanguage, string> = {
  typescript: `
    (function_declaration name: (identifier) @name) @func
    (method_definition name: (property_identifier) @name) @func
    (arrow_function) @func
    (function_expression) @func
  `,
  javascript: `
    (function_declaration name: (identifier) @name) @func
    (method_definition name: (property_identifier) @name) @func
    (arrow_function) @func
    (function_expression) @func
  `,
  python: `
    (function_definition name: (identifier) @name) @func
  `,
  go: `
    (function_declaration name: (identifier) @name) @func
    (method_declaration name: (field_identifier) @name) @func
  `,
  rust: `
    (function_item name: (identifier) @name) @func
  `,
  java: `
    (method_declaration name: (identifier) @name) @func
    (constructor_declaration name: (identifier) @name) @func
  `,
  c: `
    (function_definition declarator: (function_declarator declarator: (identifier) @name)) @func
  `,
  cpp: `
    (function_definition declarator: (function_declarator declarator: (identifier) @name)) @func
    (function_definition declarator: (function_declarator declarator: (qualified_identifier) @name)) @func
  `,
  ruby: `
    (method name: (identifier) @name) @func
    (singleton_method name: (identifier) @name) @func
  `,
};

export interface FunctionLocation {
  name: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}

/**
 * Detects language from file extension.
 */
export function detectLanguage(filePath: string): SupportedLanguage | null {
  const ext = extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] ?? null;
}

/**
 * Checks if a language is supported for parsing.
 */
export function isLanguageSupported(language: string): language is SupportedLanguage {
  return language in FUNCTION_QUERIES;
}

/**
 * Gets or creates a parser for the given language.
 */
async function getParser(language: SupportedLanguage): Promise<Parser | null> {
  const existing = parsers.get(language);
  if (existing !== undefined) {
    return existing;
  }

  const grammar = await loadGrammar(language);
  if (grammar === null) {
    return null;
  }

  const parser = new Parser();
  parser.setLanguage(grammar);
  parsers.set(language, parser);
  return parser;
}

/**
 * Parses source code and extracts function locations.
 */
export async function getFunctions(
  code: string,
  language: SupportedLanguage
): Promise<FunctionLocation[]> {
  const parser = await getParser(language);
  if (parser === null) {
    return [];
  }

  const tree = parser.parse(code);
  const functions: FunctionLocation[] = [];

  walkTree(tree.rootNode, language, functions);

  return functions;
}

/** Recursively traverses AST to find function nodes and extract their locations. */
function walkTree(
  node: Parser.SyntaxNode,
  language: SupportedLanguage,
  functions: FunctionLocation[]
): void {
  if (isFunctionNode(node, language)) {
    const name = extractFunctionName(node);
    functions.push({
      name: name ?? "<anonymous>",
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      startColumn: node.startPosition.column,
      endColumn: node.endPosition.column,
    });
  }

  for (const child of node.children) {
    walkTree(child, language, functions);
  }
}

/** Checks if node type represents a function declaration in the given language. */
function isFunctionNode(node: Parser.SyntaxNode, language: SupportedLanguage): boolean {
  const functionTypes = getFunctionNodeTypes(language);
  return functionTypes.includes(node.type);
}

/** Returns AST node types that represent functions for each language. */
function getFunctionNodeTypes(language: SupportedLanguage): string[] {
  switch (language) {
    case "typescript":
    case "javascript":
      return [
        "function_declaration",
        "method_definition",
        "arrow_function",
        "function_expression",
        "function",
      ];
    case "python":
      return ["function_definition"];
    case "go":
      return ["function_declaration", "method_declaration"];
    case "rust":
      return ["function_item"];
    case "java":
      return ["method_declaration", "constructor_declaration"];
    case "c":
    case "cpp":
      return ["function_definition"];
    case "ruby":
      return ["method", "singleton_method"];
    default:
      return [];
  }
}

/** Extracts function name from AST node, handling language-specific structures. */
function extractFunctionName(node: Parser.SyntaxNode): string | null {
  for (const child of node.children) {
    if (isNameNode(child)) {
      return child.text;
    }
    if (child.type === "function_declarator") {
      for (const grandchild of child.children) {
        if (grandchild.type === "identifier" || grandchild.type === "qualified_identifier") {
          return grandchild.text;
        }
      }
    }
  }
  return null;
}

/** Checks if node is an identifier type that typically holds a function name. */
function isNameNode(node: Parser.SyntaxNode): boolean {
  const nameTypes: string[] = ["identifier", "property_identifier", "field_identifier"];
  return nameTypes.includes(node.type);
}

/**
 * Parses code and returns the AST root node for custom queries.
 */
export async function parseCode(
  code: string,
  language: SupportedLanguage
): Promise<Parser.Tree | null> {
  const parser = await getParser(language);
  if (parser === null) {
    return null;
  }
  return parser.parse(code);
}

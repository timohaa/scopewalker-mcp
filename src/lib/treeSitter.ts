import { extname } from "node:path";
import Parser from "tree-sitter";
import type { SupportedLanguage } from "../types/index.js";
import { MAX_WALK_DEPTH } from "./astWalker.js";
import { extractFunctionName } from "./functionNames.js";
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

export interface FunctionLocation {
  name: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}

// Syntax that only compiles as C++. `.h` serves both languages, so the extension
// alone sends every C++ header to the C grammar, which then reports the class
// keyword as a function and drops every member.
const CPP_HEADER_MARKERS = [
  /\bclass\s+\w+\s*[:{;]/, // class Foo {, class Foo;, class Foo : Base
  /\bnamespace\s+\w+\s*\{/,
  /\bnamespace\s*\{/,
  /\btemplate\s*</,
  /^[ \t]*(?:public|private|protected)\s*:/m,
  /::/,
  /\bextern\s+"C\+\+"/,
  /\bvirtual\s+\w/,
  /\busing\s+namespace\b/,
];

/**
 * Detects language from file extension, refining `.h` when the source is supplied.
 *
 * `code` is optional so existing extension-only callers keep working; pass it
 * wherever the file has already been read, or every C++ header is parsed as C.
 */
export function detectLanguage(filePath: string, code?: string): SupportedLanguage | null {
  const ext = extname(filePath).toLowerCase();
  const language = EXTENSION_MAP[ext] ?? null;

  if (language === "c" && ext === ".h" && code !== undefined && isCppHeader(code)) {
    return "cpp";
  }

  return language;
}

/** Returns true when a `.h` file contains syntax no C compiler accepts. */
function isCppHeader(code: string): boolean {
  return CPP_HEADER_MARKERS.some((marker) => marker.test(code));
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
  functions: FunctionLocation[],
  depth = 0
): void {
  if (depth > MAX_WALK_DEPTH) {
    return;
  }

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
    walkTree(child, language, functions, depth + 1);
  }
}

/** Checks if node type represents a function declaration in the given language. */
function isFunctionNode(node: Parser.SyntaxNode, language: SupportedLanguage): boolean {
  // Several grammars name a node after a keyword they also emit as a bare token,
  // and a token match is never a real function.
  if (!node.isNamed) return false;

  const functionTypes = getFunctionNodeTypes(language);
  return functionTypes.includes(node.type);
}

/**
 * Returns AST node types that represent functions for each language.
 *
 * Callers must guard on `node.isNamed`. `function` is deliberately absent from the
 * TypeScript/JavaScript list: it names only the unnamed `function` keyword token,
 * never a node, so listing it produced one phantom function per declaration. The
 * named node for `const f = function () {}` is `function_expression`.
 */
export function getFunctionNodeTypes(language: SupportedLanguage): string[] {
  switch (language) {
    case "typescript":
    case "javascript":
      return [
        "function_declaration",
        "method_definition",
        "arrow_function",
        "function_expression",
        "generator_function_declaration", // function* f() {}
        "generator_function", // const f = function* () {}
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

/**
 * Parses code and returns the syntax tree for custom queries, or null if the grammar cannot load.
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

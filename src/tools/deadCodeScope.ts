import type Parser from "tree-sitter";
import type { DeadCodeSymbolType, SupportedLanguage, SymbolScope } from "../types/index.js";
import { getJavaAccessModifier, isExported } from "./codeInventoryVisibility.js";

const GO_EXPORTED = /^\p{Lu}/u;

const HEADER_EXTENSION = /\.(?:h|hh|hpp|hxx)$/i;

/** What a file's own shape says about how far its symbols reach. */
export interface FileScope {
  /** TS/JS only: a module's non-exported names stay in the file; a script's are globals. */
  isModule: boolean;
  /** C/C++ only: a header is textually included, so even `static` and private members travel. */
  isHeader: boolean;
}

/** Classifies a C/C++ path as a header, whose contents any translation unit may include. */
export function isHeaderFile(path: string): boolean {
  return HEADER_EXTENSION.test(path);
}

/** Checks for a `static` storage class, which confines a C/C++ symbol to its file. */
export function isStaticDeclaration(node: Parser.SyntaxNode): boolean {
  return node.children.some(
    (child) => child.type === "storage_class_specifier" && child.text === "static"
  );
}

/** Checks whether a TS/JS call node is a CommonJS `require(...)`. */
function isRequireCall(node: Parser.SyntaxNode): boolean {
  if (node.type !== "call_expression") return false;
  const callee = node.children.find((child) => child.type === "identifier");
  return callee?.text === "require";
}

/** Checks whether a TS/JS member expression writes to the CommonJS exports object. */
function isExportsTarget(node: Parser.SyntaxNode): boolean {
  if (node.type !== "member_expression") return false;
  return node.text.startsWith("module.exports") || node.text.startsWith("exports.");
}

/**
 * Detects whether a TS/JS file is a module rather than a script.
 *
 * Errs toward "script": a script's top-level names are globals that any other
 * file may reach, so misreading a module as a script only demotes a finding,
 * while the reverse would invent one.
 */
export function isModuleFile(root: Parser.SyntaxNode): boolean {
  for (const child of root.children) {
    if (child.type === "import_statement" || child.type === "export_statement") return true;
  }

  const stack: Parser.SyntaxNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) break;
    if (isRequireCall(node) || isExportsTarget(node)) return true;
    for (const child of node.children) {
      stack.push(child);
    }
  }

  return false;
}

/**
 * Maps a Java access modifier onto a reachability scope.
 *
 * `private` is not `local`: `Class.forName("Outer$Inner")` and
 * `getDeclaredMethod("name")` reach private members from any package, and the
 * string that names them only counts once the file holding it is scanned.
 */
function javaScope(node: Parser.SyntaxNode): SymbolScope {
  const access = getJavaAccessModifier(node);
  if (access === "public" || access === "protected") return "public";
  return "package";
}

/** Checks for an explicit `private` keyword on a TS/JS class member. */
export function hasPrivateModifier(node: Parser.SyntaxNode): boolean {
  return node.children.some(
    (child) => child.type === "accessibility_modifier" && child.text === "private"
  );
}

/**
 * Classifies how far a private method can be reached from.
 *
 * No language in the set confines a private method to its file. TypeScript
 * allows `obj["name"]()` past `private`, Java reflection reaches any member,
 * an underscore prefix is a convention in JS, Python and Ruby, Go declares
 * methods outside the type body, and Ruby lets a subclass or a reopened class
 * call a private method by name. Each of those references is a token the scan
 * counts, so the whole directory is needed before a miss means anything. A C++
 * private member is callable from any out-of-line member definition, which
 * may sit in a source file that includes the header.
 */
function methodScope(language: SupportedLanguage, file: FileScope): SymbolScope {
  if (language === "c" || language === "cpp") return file.isHeader ? "public" : "local";
  return "package";
}

/** How far a TS/JS top-level symbol reaches: a script's names are globals. */
function scriptScope(
  node: Parser.SyntaxNode,
  name: string,
  language: SupportedLanguage,
  file: FileScope
): SymbolScope {
  return file.isModule && !isExported(name, node, language) ? "local" : "public";
}

/** Rust: any `pub(...)`, `pub(crate)` included, may be used by an unscanned file. */
function rustScope(node: Parser.SyntaxNode): SymbolScope {
  return node.children.some((child) => child.type === "visibility_modifier") ? "public" : "package";
}

/** C/C++: only a `static` symbol outside a header stays in its translation unit. */
function cScope(node: Parser.SyntaxNode, file: FileScope): SymbolScope {
  return isStaticDeclaration(node) && !file.isHeader ? "local" : "public";
}

type ScopeRule = (
  node: Parser.SyntaxNode,
  name: string,
  language: SupportedLanguage,
  file: FileScope
) => SymbolScope;

// Ruby has no visibility marker for top-level symbols, so everything is public.
const TOP_LEVEL_SCOPE: Record<SupportedLanguage, ScopeRule> = {
  typescript: scriptScope,
  javascript: scriptScope,
  go: (_node, name) => (GO_EXPORTED.test(name) ? "public" : "package"),
  rust: (node) => rustScope(node),
  java: (node) => javaScope(node),
  python: (_node, name) => (name.startsWith("_") ? "package" : "public"),
  c: (node, _name, _language, file) => cScope(node, file),
  cpp: (node, _name, _language, file) => cScope(node, file),
  ruby: () => "public",
};

/**
 * Classifies how far a declared symbol can be reached from.
 *
 * Rust is read here rather than through `isExported`, which reports `pub(crate)`
 * as unexported; a crate-visible item can still be used by an unscanned file, so
 * it has to count as public.
 */
export function symbolScope(
  node: Parser.SyntaxNode,
  name: string,
  language: SupportedLanguage,
  type: DeadCodeSymbolType,
  file: FileScope
): SymbolScope {
  if (type === "method") return methodScope(language, file);
  return TOP_LEVEL_SCOPE[language](node, name, language, file);
}

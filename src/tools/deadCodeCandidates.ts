import type Parser from "tree-sitter";
import { MAX_WALK_DEPTH } from "../lib/astWalker.js";
import type {
  DeadCodeCandidate,
  DeadCodeSymbolType,
  InventoryItem,
  MethodInfo,
  SupportedLanguage,
} from "../types/index.js";
import { collectGoMethods } from "./codeInventoryGoMethods.js";
import { extractItem, extractMethodName, isMethodNode } from "./codeInventoryHelpers.js";
import {
  hasBaseClass,
  hasTokenPasting,
  isExcludedDeclaration,
  isExcludedName,
  isTraitScope,
} from "./deadCodeExclusions.js";
import { tokenize } from "./deadCodeReferences.js";
import {
  type FileScope,
  hasPrivateModifier,
  isHeaderFile,
  isModuleFile,
  symbolScope,
} from "./deadCodeScope.js";

// Node types that hold a class's direct member list, mirroring extractMethods.
const CLASS_BODY_TYPES = new Set([
  "class_body",
  "block",
  "body_statement",
  "field_declaration_list",
]);

// Node types that put a declaration inside a body rather than at file level.
// Only file-level symbols and private class members are in scope; a binding
// inside a function is the linter's job, not this tool's.
const NESTING_TYPES = new Set([
  "function_declaration",
  "function_definition",
  "function_item",
  "function_expression",
  "generator_function",
  "generator_function_declaration",
  "arrow_function",
  "lambda",
  "closure_expression",
  "method_definition",
  "method_declaration",
  "method",
  "singleton_method",
  "public_method_definition",
]);

/**
 * Checks for a subtree that can hold no candidate: a function body, a
 * TypeScript `declare` block that declares no code, or a Rust trait scope.
 */
function isOpaqueSubtree(node: Parser.SyntaxNode, language: SupportedLanguage): boolean {
  if (NESTING_TYPES.has(node.type) || node.type === "ambient_declaration") return true;
  return language === "rust" && isTraitScope(node);
}

/**
 * Visits every node that may declare a candidate, skipping opaque subtrees.
 *
 * Pruning replaces an ancestor check per node: tree-sitter resolves `.parent`
 * by walking down from the root, so asking each node for its ancestors made
 * discovery quadratic on deeply nested input and tripped the size guards.
 */
function walkDeclarations(
  node: Parser.SyntaxNode,
  language: SupportedLanguage,
  visit: (node: Parser.SyntaxNode) => void,
  depth = 0
): void {
  if (depth > MAX_WALK_DEPTH) return;
  visit(node);
  if (isOpaqueSubtree(node, language)) return;
  for (const child of node.children) {
    walkDeclarations(child, language, visit, depth + 1);
  }
}

/**
 * Reduces a declared name to the token its references are counted under.
 * Ruby's `valid?` is written `valid` at every call site, and a C++ out-of-line
 * definition (`Widget::resize`) names a member declared elsewhere, so it is
 * dropped rather than counted twice.
 */
function candidateKey(name: string): string | null {
  if (name.includes("::")) return null;
  return tokenize(name)[0] ?? null;
}

interface FileContext {
  file: string;
  language: SupportedLanguage;
  scope: FileScope;
}

/** Builds a candidate unless the name has no token or a rule excludes the declaration. */
function makeCandidate(
  node: Parser.SyntaxNode,
  name: string,
  type: DeadCodeSymbolType,
  line: number,
  context: FileContext
): DeadCodeCandidate | null {
  const key = candidateKey(name);
  if (key === null) return null;
  if (isExcludedDeclaration(node, name, context.language, type)) return null;

  return {
    file: context.file,
    name,
    type,
    line,
    key,
    scope: symbolScope(node, name, context.language, type, context.scope),
  };
}

/** Records a method node under the line and name its MethodInfo carries. */
function indexMethodNode(node: Parser.SyntaxNode, index: Map<string, Parser.SyntaxNode>): void {
  if (!isMethodNode(node)) return;
  const name = extractMethodName(node);
  if (name !== null) index.set(`${String(node.startPosition.row + 1)}:${name}`, node);
}

/**
 * Indexes a class's method nodes so a MethodInfo can find its node.
 * Only direct members count, as in extractMethods; Ruby's `private def x`
 * nests the method one level down inside a call.
 */
function indexMethodNodes(classNode: Parser.SyntaxNode): Map<string, Parser.SyntaxNode> {
  const index = new Map<string, Parser.SyntaxNode>();
  const body = classNode.children.find((child) => CLASS_BODY_TYPES.has(child.type));
  if (!body) return index;

  for (const member of body.children) {
    indexMethodNode(member, index);
    if (member.type === "call") {
      for (const inner of member.children) indexMethodNode(inner, index);
    }
  }

  return index;
}

/**
 * Checks whether a private method may be a hook its base class calls by name.
 *
 * Java's `private` cannot override, and TypeScript rejects a `private` member
 * that clashes with a typed base member, so those two stay candidates. Any
 * other private method of a subclass, and anything marked `override`, may be
 * the target of a call that lives in an unscanned base.
 */
function isBaseClassHook(
  node: Parser.SyntaxNode,
  classNode: Parser.SyntaxNode,
  language: SupportedLanguage
): boolean {
  if (language === "java") return false;
  if (node.children.some((child) => child.type === "override_modifier")) return true;
  if (!hasBaseClass(classNode, language)) return false;
  return !(language === "typescript" && hasPrivateModifier(node));
}

/** Collects a class's private methods, which nothing outside the class can reach. */
function collectPrivateMethods(
  classNode: Parser.SyntaxNode,
  methods: MethodInfo[],
  context: FileContext
): DeadCodeCandidate[] {
  const index = indexMethodNodes(classNode);
  const candidates: DeadCodeCandidate[] = [];

  for (const method of methods) {
    if (method.visibility !== "private") continue;

    // Without the node the annotation and hook rules cannot be applied, so the
    // method is left out rather than reported on incomplete information.
    const node = index.get(`${String(method.line)}:${method.name}`);
    if (!node || isBaseClassHook(node, classNode, context.language)) continue;

    const candidate = makeCandidate(node, method.name, "method", method.line, context);
    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

/** Collects Go's unexported receiver methods, which its package alone can reach. */
function collectGoMethodCandidates(
  root: Parser.SyntaxNode,
  context: FileContext
): DeadCodeCandidate[] {
  const candidates: DeadCodeCandidate[] = [];

  for (const { method } of collectGoMethods(root, context.file, true)) {
    if (method.visibility !== "private") continue;
    if (isExcludedName(method.name, "go", "method")) continue;

    const key = candidateKey(method.name);
    if (key === null) continue;

    candidates.push({
      file: context.file,
      name: method.name,
      type: "method",
      line: method.line,
      key,
      scope: "package",
    });
  }

  return candidates;
}

/** Adds the item declared at a node, plus its private methods when it is a class. */
function collectFromNode(
  node: Parser.SyntaxNode,
  item: InventoryItem,
  context: FileContext,
  into: DeadCodeCandidate[]
): void {
  const candidate = makeCandidate(node, item.name, item.type, item.line, context);
  if (candidate) into.push(candidate);

  if (item.type === "class" && item.methods) {
    into.push(...collectPrivateMethods(node, item.methods, context));
  }
}

/** Reads the file-level facts the scope rules need. */
function fileScopeOf(
  root: Parser.SyntaxNode,
  language: SupportedLanguage,
  relativePath: string
): FileScope {
  const isScript = language === "typescript" || language === "javascript";
  const isC = language === "c" || language === "cpp";
  return {
    isModule: isScript && isModuleFile(root),
    isHeader: isC && isHeaderFile(relativePath),
  };
}

/** Collects every symbol in one file that dead-code detection may report. */
export function collectCandidates(
  root: Parser.SyntaxNode,
  language: SupportedLanguage,
  relativePath: string,
  code: string
): DeadCodeCandidate[] {
  const isC = language === "c" || language === "cpp";
  if (isC && hasTokenPasting(code)) return [];

  const context: FileContext = {
    file: relativePath,
    language,
    scope: fileScopeOf(root, language, relativePath),
  };

  const candidates: DeadCodeCandidate[] = [];

  walkDeclarations(root, language, (node) => {
    const item = extractItem(node, language, true);
    if (item) collectFromNode(node, item, context, candidates);
  });

  if (language === "go") {
    candidates.push(...collectGoMethodCandidates(root, context));
  }

  return candidates;
}

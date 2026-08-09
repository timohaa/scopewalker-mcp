import type Parser from "tree-sitter";
import {
  findParameterList,
  isPythonReceiver,
  PYTHON_NON_PARAMETER_TYPES,
} from "../lib/parameterList.js";
import type { SupportedLanguage } from "../types/index.js";

/**
 * Extracts parameter names from a function node.
 * Handles typed params, destructured params, rest params across languages.
 */
export function extractParameterNames(
  funcNode: Parser.SyntaxNode,
  language: SupportedLanguage
): string[] {
  const paramListNode = findParameterList(funcNode);
  if (paramListNode === null) return [];

  const names: string[] = [];

  if (language === "python") {
    extractPythonParamNames(paramListNode, names);
  } else {
    for (const child of paramListNode.namedChildren) {
      extractNamesFromParamNode(child, names, language);
    }
  }

  return names;
}

// Python wrappers that hold the bound name in an identifier child rather than
// being one: `a: int`, `a=1`, `a: int = 1`.
const PYTHON_NAMED_WRAPPERS = ["typed_parameter", "default_parameter", "typed_default_parameter"];

/** Pushes the name a single Python parameter node binds, if it binds one. */
function pushPythonParamName(child: Parser.SyntaxNode, names: string[]): void {
  if (child.type === "identifier") {
    names.push(child.text);
    return;
  }

  if (PYTHON_NAMED_WRAPPERS.includes(child.type)) {
    const id = child.namedChildren.find((c) => c.type === "identifier");
    if (id !== undefined) names.push(id.text);
  }
}

/**
 * Extracts Python parameter names, skipping self/cls and splats.
 *
 * Only the very first child can be the receiver, so the flag clears on every
 * iteration including skipped ones — otherwise `def m(*args, self)` would drop
 * `self`, which is a real parameter there.
 *
 * Deliberately not merged with countPythonParameters in complexityMetricsParameters.ts
 * despite sharing the skip rules above: counting counts every child it does not skip,
 * while extraction only yields names for identifiers and the wrapper types above,
 * so the two legitimately disagree on any other node.
 */
function extractPythonParamNames(paramListNode: Parser.SyntaxNode, names: string[]): void {
  let isFirst = true;

  for (const child of paramListNode.namedChildren) {
    const wasFirst = isFirst;
    isFirst = false;

    if (PYTHON_NON_PARAMETER_TYPES.includes(child.type)) continue;
    if (wasFirst && isPythonReceiver(child)) continue;

    pushPythonParamName(child, names);
  }
}

/** Extracts the value-side name from an object destructuring pair: { userId: id } -> "id". */
function extractPairPatternName(pairNode: Parser.SyntaxNode): string | null {
  const lastIdx = pairNode.namedChildren.length - 1;
  if (lastIdx < 0) return null;
  const valueNode = pairNode.namedChildren[lastIdx];
  return valueNode.type === "identifier" ? valueNode.text : null;
}

/** Extracts names from a TS/JS destructured object parameter: { userId, theme }. */
function extractObjectPatternNames(node: Parser.SyntaxNode, names: string[]): void {
  for (const child of node.namedChildren) {
    if (child.type === "shorthand_property_identifier_pattern") {
      names.push(child.text);
    } else if (child.type === "pair_pattern") {
      const name = extractPairPatternName(child);
      if (name !== null) names.push(name);
    }
  }
}

/** Extracts the first identifier child name from a node (for Rust parameter nodes). */
function extractFirstIdentifierChild(node: Parser.SyntaxNode): string | null {
  for (const child of node.namedChildren) {
    if (child.type === "identifier") return child.text;
  }
  return null;
}

/** Pushes every direct identifier child, for the flat destructuring patterns. */
function collectDirectIdentifiers(node: Parser.SyntaxNode, names: string[]): void {
  for (const child of node.namedChildren) {
    if (child.type === "identifier") names.push(child.text);
  }
}

/** Pushes the first identifier child, if there is one. */
function pushFirstIdentifierChild(node: Parser.SyntaxNode, names: string[]): void {
  const id = extractFirstIdentifierChild(node);
  if (id !== null) names.push(id);
}

/** Unwraps a TS typed parameter to the pattern it wraps. */
function unwrapTypedParameter(
  node: Parser.SyntaxNode,
  names: string[],
  language: SupportedLanguage
): void {
  if (node.namedChildren.length > 0) {
    extractNamesFromParamNode(node.namedChildren[0], names, language);
  }
}

/**
 * Per-node-type name extractors, keyed by the grammar node each language emits
 * for a parameter. A table rather than a switch so adding a grammar is one entry
 * and the arms cannot accumulate fallthrough between languages.
 */
const PARAM_NODE_EXTRACTORS: Record<
  string,
  (node: Parser.SyntaxNode, names: string[], language: SupportedLanguage) => void
> = {
  identifier: (node, names) => names.push(node.text),

  // TS/JS destructured object parameter: { userId, theme }
  object_pattern: extractObjectPatternNames,
  // TS/JS array destructuring: [first, second]
  array_pattern: collectDirectIdentifiers,
  // TS/JS rest parameter: ...rest
  rest_pattern: collectDirectIdentifiers,

  // TS typed params wrap the pattern one level down
  required_parameter: unwrapTypedParameter,
  optional_parameter: unwrapTypedParameter,

  // Go/C/C++: `name Type`, and Go allows multiple names per declaration (`a, b int`)
  parameter_declaration: collectDeepIdentifiers,
  // Java: Type name
  formal_parameter: collectDeepIdentifiers,
  // Rust: pattern: Type
  parameter: pushFirstIdentifierChild,
};

/** Recursively extracts identifiers from a single parameter node. */
function extractNamesFromParamNode(
  node: Parser.SyntaxNode,
  names: string[],
  language: SupportedLanguage
): void {
  // Fallback for unlisted node types: any identifier child is the best guess.
  const extract = PARAM_NODE_EXTRACTORS[node.type] ?? pushFirstIdentifierChild;
  extract(node, names, language);
}

/**
 * Finds the declared name inside a chain of declarators.
 *
 * C nests one declarator per level of indirection, so `char **z` is
 * pointer_declarator > pointer_declarator > identifier, and `void (*cb)(int)`
 * adds a function_declarator too. A single-level lookup finds neither.
 */
function findNameInDeclarators(node: Parser.SyntaxNode): string | null {
  for (const child of node.namedChildren) {
    if (child.type === "identifier") return child.text;

    if (child.type.includes("declarator")) {
      const nested = findNameInDeclarators(child);
      if (nested !== null) return nested;
    }
  }
  return null;
}

/**
 * Collects identifiers from a parameter declaration.
 * Handles Go multi-name params (`a, b int` — several identifier children) and
 * C/Java declarations where the name nests inside a declarator.
 */
function collectDeepIdentifiers(node: Parser.SyntaxNode, names: string[]): void {
  let found = false;
  for (const child of node.namedChildren) {
    if (child.type === "identifier") {
      names.push(child.text);
      found = true;
    }
  }
  if (found) return;

  // Only one name can hide in the declarator chain, unlike the Go case above.
  const declaredName = findNameInDeclarators(node);
  if (declaredName !== null) names.push(declaredName);
}

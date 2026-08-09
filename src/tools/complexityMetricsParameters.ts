import type Parser from "tree-sitter";
import {
  findParameterList,
  isPythonReceiver,
  PYTHON_NON_PARAMETER_TYPES,
} from "../lib/parameterList.js";
import type { SupportedLanguage } from "../types/index.js";

/** Returns parameter count for function nodes, null for non-function nodes. */
export function countParameters(
  node: Parser.SyntaxNode,
  language?: SupportedLanguage
): number | null {
  const funcTypes = [
    "function_declaration",
    "function_definition",
    "function_item",
    "method_definition",
    "method_declaration",
    "method",
    "singleton_method",
    "arrow_function",
    "function_expression",
  ];

  if (!funcTypes.includes(node.type)) return null;

  const paramsNode = findParameterList(node);
  if (paramsNode !== null) {
    return countActualParameters(paramsNode, language);
  }

  // Unparenthesized single-parameter arrow (`x => ...`): the parameter is a
  // bare identifier child instead of a formal_parameters node.
  if (node.type === "arrow_function" && node.childForFieldName("parameter") !== null) {
    return 1;
  }

  return 0;
}

/**
 * Counts Go parameters, expanding grouped declarations.
 * Go collapses same-typed parameters into one node (`a, b, c int`), so the
 * declaration count understates arity; unnamed parameters (`func(int)`) carry
 * no identifier and count as one each.
 */
function countGoParameters(children: Parser.SyntaxNode[]): number {
  let count = 0;

  for (const child of children) {
    if (child.type !== "parameter_declaration") {
      count++;
      continue;
    }
    const names = child.namedChildren.filter((c) => c.type === "identifier").length;
    count += Math.max(1, names);
  }

  return count;
}

/**
 * Counts Python parameters, excluding splats, the keyword-only separator, and a
 * leading self/cls receiver.
 *
 * Only the very first child can be the receiver, so the flag clears on every
 * iteration including skipped ones — otherwise `def m(*args, self)` would drop
 * `self`, which is a real parameter there.
 */
function countPythonParameters(children: Parser.SyntaxNode[]): number {
  let count = 0;
  let isFirst = true;

  for (const child of children) {
    const wasFirst = isFirst;
    isFirst = false;

    if (PYTHON_NON_PARAMETER_TYPES.includes(child.type)) continue;
    if (wasFirst && isPythonReceiver(child)) continue;

    count++;
  }

  return count;
}

/** Counts actual parameters, excluding language-specific non-parameter nodes. */
function countActualParameters(
  paramsNode: Parser.SyntaxNode,
  language?: SupportedLanguage
): number {
  const children = paramsNode.namedChildren;

  if (language === "go") return countGoParameters(children);
  if (language === "python") return countPythonParameters(children);

  return children.length;
}

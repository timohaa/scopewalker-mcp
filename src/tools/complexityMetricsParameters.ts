import type Parser from "tree-sitter";
import type { SupportedLanguage } from "../types/index.js";

// Parameter-list node types across grammars: TS/JS (formal_parameters),
// Python/Rust (parameters), C/C++/Go (parameter_list), Ruby (method_parameters).
const PARAM_LIST_TYPES = ["formal_parameters", "parameters", "parameter_list", "method_parameters"];

/**
 * Locates a function's parameter list.
 * The named field is preferred because Go's method_declaration also carries a
 * receiver parameter_list, which a positional scan would match first.
 * C/C++ expose no such field and nest the list inside the declarator instead.
 */
function findParameterList(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
  const byField = node.childForFieldName("parameters");
  if (byField !== null) return byField;

  for (const child of node.children) {
    if (PARAM_LIST_TYPES.includes(child.type)) return child;
    if (child.type === "function_declarator" || child.type === "pointer_declarator") {
      const nested = findParameterList(child);
      if (nested !== null) return nested;
    }
  }

  return null;
}

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
 * Counts actual parameters, excluding language-specific non-parameter nodes.
 * For Python: excludes keyword_separator (*), list_splat_pattern (*args),
 * dictionary_splat_pattern (**kwargs), and self/cls as first parameter.
 */
function countActualParameters(
  paramsNode: Parser.SyntaxNode,
  language?: SupportedLanguage
): number {
  const children = paramsNode.namedChildren;

  if (language === "go") {
    return countGoParameters(children);
  }

  if (language === "python") {
    let count = 0;
    let isFirst = true;

    for (const child of children) {
      // Only the first child can be the receiver; clear the flag unconditionally
      // so params after skipped splats/separators are not mistaken for it
      const wasFirst = isFirst;
      isFirst = false;

      // Skip keyword_separator (*) used to mark keyword-only parameters
      if (child.type === "keyword_separator") {
        continue;
      }

      // Skip list_splat_pattern (*args) and dictionary_splat_pattern (**kwargs)
      if (child.type === "list_splat_pattern" || child.type === "dictionary_splat_pattern") {
        continue;
      }

      // Skip self/cls as first parameter (method receiver)
      if (wasFirst) {
        const paramName = child.type === "identifier" ? child.text : null;
        if (paramName === "self" || paramName === "cls") {
          continue;
        }
      }

      count++;
    }

    return count;
  }

  return children.length;
}

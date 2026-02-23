import type Parser from "tree-sitter";
import { walkNode } from "../lib/astWalker.js";
export { walkNode };
import { countImports } from "../lib/treeSitter.js";
import type { SupportedLanguage } from "../types/index.js";
export { findHotspots, calculateSummary } from "./complexityMetricsHotspots.js";

export const HIGH_NESTING_THRESHOLD = 4;
export const HIGH_PARAMS_THRESHOLD = 5;
export const HIGH_COMPLEXITY_THRESHOLD = 20;

/**
 * Checks if an if_statement is part of an "else if" chain.
 * In tree-sitter, "else if" is represented as:
 *   if_statement
 *     ├── else (keyword)
 *     └── if_statement (sibling - this is the "else if")
 * So we check if the if_statement has a previous sibling that is an 'else' keyword.
 */
function isElseIf(node: Parser.SyntaxNode): boolean {
  if (node.type !== "if_statement") return false;

  const parent = node.parent;
  if (!parent) return false;

  const siblings = parent.children;
  const nodeIndex = siblings.indexOf(node);

  // Check if the previous sibling is an 'else' keyword
  if (nodeIndex > 0 && siblings[nodeIndex - 1].type === "else") {
    return true;
  }

  return false;
}

/** Calculates maximum nesting depth by tracking control flow structures. */
export function calculateNestingDepth(node: Parser.SyntaxNode, currentDepth: number): number {
  const nestingTypes = [
    "if_statement",
    "for_statement",
    "while_statement",
    "for_in_statement",
    "try_statement",
    "switch_statement",
    "switch_expression", // Java switch statements
    "match_expression",
    "lambda_expression",
    "arrow_function",
  ];

  let maxDepth = currentDepth;

  // Don't count "else if" as additional nesting - it's a sibling branch, not nested
  const isNesting = nestingTypes.includes(node.type) && !isElseIf(node);
  const newDepth = isNesting ? currentDepth + 1 : currentDepth;

  for (const child of node.children) {
    const childDepth = calculateNestingDepth(child, newDepth);
    maxDepth = Math.max(maxDepth, childDepth);
  }

  return maxDepth;
}

/** Returns parameter count for function nodes, null for non-function nodes. */
export function countParameters(
  node: Parser.SyntaxNode,
  language?: SupportedLanguage
): number | null {
  const funcTypes = [
    "function_declaration",
    "function_definition",
    "method_definition",
    "method_declaration",
    "arrow_function",
    "function_expression",
  ];

  if (!funcTypes.includes(node.type)) return null;

  for (const child of node.children) {
    if (
      child.type === "formal_parameters" ||
      child.type === "parameters" ||
      child.type === "parameter_list"
    ) {
      return countActualParameters(child, language);
    }
  }

  return 0;
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

  if (language === "python") {
    let count = 0;
    let isFirst = true;

    for (const child of children) {
      // Skip keyword_separator (*) used to mark keyword-only parameters
      if (child.type === "keyword_separator") {
        continue;
      }

      // Skip list_splat_pattern (*args) and dictionary_splat_pattern (**kwargs)
      if (child.type === "list_splat_pattern" || child.type === "dictionary_splat_pattern") {
        continue;
      }

      // Skip self/cls as first parameter (method receiver)
      if (isFirst) {
        isFirst = false;
        const paramName = child.type === "identifier" ? child.text : null;
        if (paramName === "self" || paramName === "cls") {
          continue;
        }
      }

      count++;
    }

    return count;
  }

  // For other languages, use namedChildCount directly
  return children.length;
}

/**
 * Counts import/dependency statements using AST analysis via tree-sitter.
 * Delegates to countImports which properly handles comments, string contents,
 * and language-specific import syntax.
 */
export async function countDependencies(
  code: string,
  language: SupportedLanguage
): Promise<number> {
  return countImports(code, language);
}

const CONTROL_FLOW_TYPES = [
  "if_statement",
  "for_statement",
  "while_statement",
  "for_in_statement",
  "switch_statement",
  "catch_clause",
  "conditional_expression",
];

/** Returns complexity increment for a node: 1 + nesting for control flow, 1 for logical operators. */
function getNodeComplexityIncrement(node: Parser.SyntaxNode, nesting: number): number {
  if (CONTROL_FLOW_TYPES.includes(node.type)) {
    return 1 + nesting;
  }

  if (node.type === "binary_expression") {
    const hasLogicalOp = node.children.some((c) => c.type === "&&" || c.type === "||");
    return hasLogicalOp ? 1 : 0;
  }

  return 0;
}

/**
 * Simplified cognitive complexity calculation.
 * Increments for control flow structures and nesting.
 */
export function calculateCognitiveComplexity(rootNode: Parser.SyntaxNode): number {
  let complexity = 0;

  /**
   * Recursively walks the AST, accumulating complexity based on control flow
   * structures and their nesting depth.
   */
  function walkForComplexity(node: Parser.SyntaxNode, nesting: number): void {
    complexity += getNodeComplexityIncrement(node, nesting);

    const nextNesting = CONTROL_FLOW_TYPES.includes(node.type) ? nesting + 1 : nesting;
    for (const child of node.children) {
      walkForComplexity(child, nextNesting);
    }
  }

  walkForComplexity(rootNode, 0);
  return complexity;
}

/** Returns prop count for JSX component nodes, null for non-JSX or HTML element nodes. */
export function countJsxProps(node: Parser.SyntaxNode): number | null {
  if (node.type !== "jsx_self_closing_element" && node.type !== "jsx_opening_element") return null;

  const tagName = extractJsxComponentName(node);
  if (tagName === null) return null;

  // Skip HTML elements (lowercase first character)
  if (/^[a-z]/.test(tagName)) return null;

  let count = 0;
  for (const child of node.children) {
    if (child.type === "jsx_attribute") {
      count++;
    }
  }
  return count;
}

/** Extracts component name from a JSX element node. */
export function extractJsxComponentName(node: Parser.SyntaxNode): string | null {
  for (const child of node.children) {
    if (child.type === "identifier" || child.type === "member_expression") {
      return child.text;
    }
  }
  return null;
}

/** Extracts function name from identifier children. */
export function extractFunctionName(node: Parser.SyntaxNode): string | null {
  for (const child of node.children) {
    if (child.type === "identifier" || child.type === "property_identifier") {
      return child.text;
    }
  }
  return null;
}

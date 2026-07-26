import type Parser from "tree-sitter";
import { walkNode } from "../lib/astWalker.js";
export { walkNode };
import { countImports } from "../lib/treeSitter.js";
import type { SupportedLanguage } from "../types/index.js";
export { findHotspots, calculateSummary } from "./complexityMetricsHotspots.js";
export { countParameters } from "./complexityMetricsParameters.js";

/** Nesting depth above which a function is flagged as a hotspot. */
export const HIGH_NESTING_THRESHOLD = 4;
/** Parameter count above which a function is flagged as a hotspot. */
export const HIGH_PARAMS_THRESHOLD = 5;
/** Cognitive complexity score above which a file is counted as high-complexity. */
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

  if (nodeIndex > 0 && siblings[nodeIndex - 1].type === "else") {
    return true;
  }

  return false;
}

const NESTING_TYPES = [
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

/**
 * Calculates maximum nesting depth by tracking control flow structures.
 * The starting node itself never counts toward the depth, so a function's own
 * node (e.g. arrow_function) does not inflate its reported nesting.
 */
export function calculateNestingDepth(node: Parser.SyntaxNode, currentDepth: number): number {
  let maxDepth = currentDepth;

  for (const child of node.children) {
    const childDepth = walkNestingDepth(child, currentDepth);
    maxDepth = Math.max(maxDepth, childDepth);
  }

  return maxDepth;
}

/** Recursive helper that counts nesting for the given node and its descendants. */
function walkNestingDepth(node: Parser.SyntaxNode, currentDepth: number): number {
  // Don't count "else if" as additional nesting - it's a sibling branch, not nested
  const isNesting = NESTING_TYPES.includes(node.type) && !isElseIf(node);
  const newDepth = isNesting ? currentDepth + 1 : currentDepth;

  let maxDepth = newDepth;

  for (const child of node.children) {
    const childDepth = walkNestingDepth(child, newDepth);
    maxDepth = Math.max(maxDepth, childDepth);
  }

  return maxDepth;
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

  // HTML elements start with lowercase; only React components (PascalCase) have meaningful prop counts
  if (/^[a-z]/.test(tagName)) return null;

  let count = 0;
  for (const child of node.children) {
    if (child.type === "jsx_attribute") {
      count++;
    }
    if (child.type === "jsx_expression") {
      for (const exprChild of child.namedChildren) {
        if (exprChild.type === "spread_element") {
          count++;
        }
      }
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
  // Arrow functions are anonymous: an identifier child is an unparenthesized
  // parameter (`x => ...`) or expression body, never the function's name.
  if (node.type === "arrow_function") {
    return null;
  }
  for (const child of node.children) {
    if (child.type === "identifier" || child.type === "property_identifier") {
      return child.text;
    }
  }
  return null;
}

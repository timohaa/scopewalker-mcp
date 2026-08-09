import type Parser from "tree-sitter";
import { walkNode } from "../lib/astWalker.js";
export { walkNode };
import { countImports } from "../lib/treeSitter.js";
import type { SupportedLanguage } from "../types/index.js";
import { isElseIfBranch } from "./complexityMetricsElseIf.js";
export { findHotspots, calculateSummary } from "./complexityMetricsHotspots.js";
export { NESTING_TYPES, calculateNestingDepth } from "./complexityMetricsNesting.js";
export { countParameters } from "./complexityMetricsParameters.js";

/** Nesting depth above which a function is flagged as a hotspot. */
export const HIGH_NESTING_THRESHOLD = 4;
/** Parameter count above which a function is flagged as a hotspot. */
export const HIGH_PARAMS_THRESHOLD = 5;
/** Cognitive complexity score above which a file is counted as high-complexity. */
export const HIGH_COMPLEXITY_THRESHOLD = 20;

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

// Same grammar spread as NESTING_TYPES: Rust expression forms, Ruby
// keyword-named nodes, and the switch node names Go and Java use instead of
// `switch_statement`, which otherwise leave those languages scoring zero.
// The ternary and the catch clause are the worst offenders — three and two node
// names respectively for one construct — so both are listed in full below.
export const CONTROL_FLOW_TYPES = [
  "if_statement",
  "for_statement",
  "while_statement",
  "for_in_statement",
  "do_statement", // do-while in TypeScript, JavaScript, Java, C, C++
  "enhanced_for_statement", // Java for-each
  "for_range_loop", // C++ range-based for
  "switch_statement",
  "switch_expression", // Java switch statements
  "expression_switch_statement", // Go switch statements
  "type_switch_statement", // Go type switches
  "catch_clause", // TypeScript, JavaScript, Java, C++
  "except_clause", // Python
  "conditional_expression", // ternary in Python, C, C++
  "ternary_expression", // ternary in TypeScript, JavaScript, Java
  "conditional", // ternary in Ruby
  "if_expression",
  "for_expression",
  "while_expression",
  "loop_expression",
  "match_expression",
  "closure_expression",
  "if",
  "unless",
  "while",
  "until",
  "for",
  "case",
  "case_match", // Ruby 3 `case ... in`
  "rescue",
  // Ruby's statement modifiers are branches without a block. They belong here but
  // not in NESTING_TYPES: `b if a` is a decision, not a level of indentation.
  "if_modifier",
  "unless_modifier",
  "while_modifier",
  "until_modifier",
  "rescue_modifier",
  // Python and Ruby give else-if its own node instead of nesting a second if,
  // so without these two the whole chain scores as a single branch.
  "elif_clause",
  "elsif",
];

// Ruby names its binary operator node `binary` and Python splits logical
// operators out into `boolean_operator`; every other grammar here uses
// `binary_expression`. All three only score when the operator is actually logical.
export const BINARY_TYPES = ["binary_expression", "binary", "boolean_operator"];

// Python spells its logical operators `and`/`or`, as does Ruby alongside `&&`/`||`.
// No other supported grammar emits those two as operator tokens, so matching them
// cannot over-count.
export const LOGICAL_OPERATORS = ["&&", "||", "and", "or"];

/** Returns complexity increment for a node: 1 + nesting for control flow, 1 for logical operators. */
function getNodeComplexityIncrement(node: Parser.SyntaxNode, nesting: number): number {
  // Unnamed keyword tokens share names with Ruby's control-flow nodes (see CONTROL_FLOW_TYPES).
  if (!node.isNamed) return 0;

  if (CONTROL_FLOW_TYPES.includes(node.type)) {
    // An else-if is a sibling branch of the chain, not a new level, so it scores a
    // flat 1. Without this, a three-branch chain costs 6 in TypeScript, 5 in Python
    // and 6 in Ruby; all three now agree on 3.
    return isElseIfBranch(node) ? 1 : 1 + nesting;
  }

  if (BINARY_TYPES.includes(node.type)) {
    const hasLogicalOp = node.children.some((c) => LOGICAL_OPERATORS.includes(c.type));
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

    // The else-if check has to happen here too: the increment above only fixes the
    // branch's own score, this fixes every statement inside it. The isNamed guard
    // mirrors getNodeComplexityIncrement and is behaviour-neutral (unnamed nodes are
    // leaf tokens with no children to pass the nesting level down to).
    const isControlFlow = node.isNamed && CONTROL_FLOW_TYPES.includes(node.type);
    const nextNesting = isControlFlow && !isElseIfBranch(node) ? nesting + 1 : nesting;
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

  // A grammar's own `name` field is authoritative where it exists. Go names
  // methods with a field_identifier the scan below rejects, so every method in a
  // Go file used to be reported as <anonymous>.
  const nameField = node.childForFieldName("name");
  if (nameField) return nameField.text;

  for (const child of node.children) {
    if (child.type === "identifier" || child.type === "property_identifier") {
      return child.text;
    }
  }
  return null;
}

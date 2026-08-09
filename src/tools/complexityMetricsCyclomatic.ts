import type Parser from "tree-sitter";
import { BINARY_TYPES, LOGICAL_OPERATORS } from "./complexityMetricsHelpers.js";

// Classic McCabe decision points: one edge added to the control-flow graph.
//
// Two things separate this list from CONTROL_FLOW_TYPES, which drives cognitive
// complexity. First, switch/match CONTAINERS are deliberately absent — McCabe
// charges per arm, so a 12-case switch scores 13 here and 1 there. Ruby is the
// trap: its `case` is a named node the cognitive list does count, and including
// it here would double-count every switch. Second, anonymous functions are absent
// — a closure is not a branch.
//
// Bare keyword entries (`if`, `unless`, `while`, `until`, `for`, `when`) are named
// nodes only in Ruby; every other grammar emits same-named unnamed tokens, which
// is why the walk guards on isNamed.
// Exported so the grammar-name guard test can assert every entry still exists in
// some installed grammar. A renamed node otherwise just scores zero, in silence.
export const DECISION_TYPES = [
  // --- conditionals ---
  "if_statement", // TypeScript, JavaScript, Python, Go, Java, C, C++
  "if_expression", // Rust (also covers `if let`; there is no if_let_expression)
  "elif_clause", // Python
  "elsif", // Ruby
  "if", // Ruby
  "unless", // Ruby
  "if_modifier", // Ruby `a if x`
  "unless_modifier", // Ruby `b unless x`

  // --- ternaries (three node names for one construct) ---
  "ternary_expression", // TypeScript, JavaScript, Java
  "conditional_expression", // Python, C, C++
  "conditional", // Ruby

  // --- loops ---
  "for_statement", // TypeScript, JavaScript, Python, Go, Java, C, C++
  "for_in_statement", // TypeScript, JavaScript (for-of and for-in share the name)
  "while_statement", // TypeScript, JavaScript, Python, Java, C, C++
  "do_statement", // do-while in TypeScript, JavaScript, Java, C, C++
  "enhanced_for_statement", // Java for-each
  "for_range_loop", // C++ range-based for
  "for_expression", // Rust
  "while_expression", // Rust (also covers `while let`)
  "loop_expression", // Rust `loop {}`
  "while", // Ruby
  "until", // Ruby
  "for", // Ruby `for x in ...`
  "while_modifier", // Ruby `c while x`
  "until_modifier", // Ruby `d until x`

  // --- exception handlers; the try/begin and finally/ensure are not decisions ---
  "catch_clause", // TypeScript, JavaScript, Java, C++
  "except_clause", // Python (also matches `except*`)
  "rescue", // Ruby
  "rescue_modifier", // Ruby `g rescue nil`

  // --- switch arms whose default form has its own node name ---
  "switch_case", // TypeScript, JavaScript (default is switch_default)
  "expression_case", // Go value switch (default is default_case)
  "type_case", // Go type switch (default is default_case)
  "communication_case", // Go select (default is default_case)
  "when", // Ruby case/when (default is a plain else)
  "in_clause", // Ruby 3 case/in
];

// These four grammars reuse one node type for both real arms and the default arm,
// so each needs a discriminator rather than a list entry.
export const CONDITIONAL_ARM_TYPES = ["case_statement", "switch_label", "case_clause", "match_arm"];

/** Returns true for a real switch arm, false for its default/wildcard form. */
function isCountingArm(node: Parser.SyntaxNode): boolean {
  // C and C++: `case 1:` carries a `value` field, `default:` does not. Counting
  // named children instead would misfire, because `default: break;` has one.
  if (node.type === "case_statement") return node.childForFieldName("value") !== null;

  // Java: `case 1` and `case 1, 2` have named children, bare `default` has none.
  // One entry therefore covers both the colon form and the arrow form.
  if (node.type === "switch_label") return node.namedChildCount > 0;

  // Python case_clause wraps a case_pattern, Rust match_arm a match_pattern. The
  // catch-all `_` is an unnamed token, so the pattern node has zero named children
  // exactly when the arm is `case _:` or `_ =>`.
  const pattern =
    node.type === "case_clause" ? node.namedChildren[0] : node.childForFieldName("pattern");
  return (pattern?.namedChildCount ?? 0) > 0;
}

/** Returns the decision-point increment for a single node. */
function getDecisionIncrement(node: Parser.SyntaxNode): number {
  // Unnamed keyword tokens share names with Ruby's control-flow nodes.
  if (!node.isNamed) return 0;

  if (DECISION_TYPES.includes(node.type)) return 1;

  if (CONDITIONAL_ARM_TYPES.includes(node.type)) return isCountingArm(node) ? 1 : 0;

  if (BINARY_TYPES.includes(node.type)) {
    // Every grammar here nests chained operators, so `a && b && c` is two nodes
    // holding one operator each. Counting per node is therefore counting per
    // operator, which is what McCabe wants.
    return node.children.some((c) => LOGICAL_OPERATORS.includes(c.type)) ? 1 : 0;
  }

  return 0;
}

/**
 * Classic McCabe cyclomatic complexity: 1 plus the decision points in the subtree.
 *
 * Unlike cognitive complexity this applies no nesting weight — three nested ifs
 * score the same as three sequential ones — and it does not suppress else-if,
 * which is a genuine predicate with its own edge.
 *
 * Deliberately uniform across all nine grammars rather than matching radon, which
 * additionally charges for Python's `with`, `assert`, and comprehensions. Those
 * have no detectable counterpart in the other eight languages, so importing them
 * would make the same algorithm score higher in Python.
 */
export function calculateCyclomaticComplexity(rootNode: Parser.SyntaxNode): number {
  let complexity = 1;

  function walk(node: Parser.SyntaxNode): void {
    complexity += getDecisionIncrement(node);
    for (const child of node.children) walk(child);
  }

  walk(rootNode);
  return complexity;
}

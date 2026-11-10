import type Parser from "tree-sitter";
import { MAX_WALK_DEPTH } from "../lib/astWalker.js";
import { getFunctionNodeTypes } from "../lib/treeSitter.js";
import type { SupportedLanguage } from "../types/index.js";
import { isElseIf } from "./complexityMetricsElseIf.js";

// The five names anonymous functions carry across the nine grammars.
const ANONYMOUS_FUNCTION_TYPES = [
  "lambda_expression", // Java and C++ lambdas
  "arrow_function", // TypeScript and JavaScript arrows
  "lambda", // Python `lambda x:` and Ruby's stabby `->(x){}`
  "func_literal", // Go function literals
  "closure_expression", // Rust closures
];

// A call's argument list: `arguments` in TypeScript, JavaScript and Rust,
// `argument_list` in the other grammars.
const ARGUMENT_LIST_TYPES = ["arguments", "argument_list"];

// Rust models control flow as expressions; Ruby names its nodes after the
// keyword. Ruby's two block forms are absent from this list on purpose and are
// judged by isRubyBlock instead, which needs the language and the parent node.
// Anonymous functions carry five names across the nine grammars and all five are
// listed, so a callback nests the same amount whatever it is written in.
// Exported so the grammar-name guard test can assert every entry still exists in
// some installed grammar. A renamed node otherwise scores zero without an error.
export const NESTING_TYPES = [
  "if_statement",
  "for_statement",
  "while_statement",
  "for_in_statement",
  "do_statement", // do-while in TypeScript, JavaScript, Java, C, C++
  "enhanced_for_statement", // Java for-each, the idiomatic loop in modern Java
  "for_range_loop", // C++ range-based for
  "case_match", // Ruby 3 `case ... in`, the pattern-matching sibling of `case`
  "try_statement",
  "switch_statement",
  "switch_expression", // Java switch statements
  "expression_switch_statement", // Go switch statements
  "type_switch_statement", // Go type switches
  "select_statement", // Go select; one level, like the two switches above
  "match_expression",
  ...ANONYMOUS_FUNCTION_TYPES,
  "if_expression",
  "for_expression",
  "while_expression",
  "loop_expression",
  "if",
  "unless",
  "while",
  "until",
  "for",
  "case",
  "begin",
  // Ruby's `do_block` and brace `block` are handled by isRubyBlock, not listed
  // here: both need the lambda-body exclusion, and one of the two names collides
  // with Rust.
];

/**
 * Calculates maximum nesting depth by tracking control flow structures.
 * The starting node itself never counts toward the depth, so a function's own
 * node (e.g. arrow_function) does not inflate its reported nesting.
 *
 * The language is required rather than optional: Ruby's brace block can only be
 * counted once the caller says which grammar produced the tree, and defaulting it
 * away would silently drop those levels again.
 */
export function calculateNestingDepth(
  node: Parser.SyntaxNode,
  currentDepth: number,
  language: SupportedLanguage
): number {
  let maxDepth = currentDepth;

  for (const child of node.children) {
    const childDepth = walkNestingDepth(child, currentDepth, language);
    maxDepth = Math.max(maxDepth, childDepth);
  }

  return maxDepth;
}

/**
 * Ruby's two block forms, which have to be judged together and out of
 * NESTING_TYPES for two separate reasons.
 *
 * `block` (the brace form) cannot live in the shared list at all: tree-sitter-rust
 * names any braced scope `block`, so counting it there would make every Rust
 * function body a nesting level. It is only safe once the language is known.
 *
 * Neither form counts when it is a lambda's body. `->(x) { ... }` parses as
 * `lambda > block`, and `lambda` already supplies the level, so counting the body
 * too reports 2 for what an arrow function reports as 1.
 */
function isRubyBlock(node: Parser.SyntaxNode, language: SupportedLanguage): boolean {
  if (language !== "ruby") return false;
  if (node.type !== "block" && node.type !== "do_block") return false;

  return node.parent?.type !== "lambda";
}

/**
 * Returns true when a node adds a level of nesting.
 *
 * The named check keeps Ruby's `if`/`while`/`case` nodes from colliding with the
 * same-named keyword tokens every other grammar emits inside its statements.
 * An `else if` is a sibling branch, not a level.
 */
function isNestingNode(node: Parser.SyntaxNode, language: SupportedLanguage): boolean {
  return (
    node.isNamed &&
    (NESTING_TYPES.includes(node.type) || isRubyBlock(node, language)) &&
    !isElseIf(node)
  );
}

/**
 * Collects the subtree nesting depth of every node in one pass.
 *
 * Equivalent to calling calculateNestingDepth on each node, which is what the
 * complexity tool did: each of those calls re-walked the node's whole subtree, so
 * the total work grew with file size times tree depth. On llama.cpp's 19k-line
 * ggml-vulkan.cpp that cost about 30 seconds for one file. A node's depth is its
 * deepest child's depth plus its own level, so a single post-order pass produces
 * the identical list.
 *
 * One node is left out on purpose. An anonymous function that nothing encloses is
 * a definition (`const f = () => {}`, a class field, a Go `var f = func() {}`), and
 * its own node adds no level, the same as a function declaration's. It counts once
 * it sits inside a function, a nesting construct, or a call's arguments, which
 * keeps every callback a level.
 */
export function collectSubtreeNestingDepths(
  rootNode: Parser.SyntaxNode,
  language: SupportedLanguage
): number[] {
  const depths: number[] = [];
  // Hoisted: getFunctionNodeTypes rebuilds the array on every call.
  const enclosingTypes = [...getFunctionNodeTypes(language), ...ARGUMENT_LIST_TYPES];

  /** Returns the node's own nesting depth and records its children's. */
  function visit(node: Parser.SyntaxNode, depth: number, enclosed: boolean): number {
    const nesting = isNestingNode(node, language);
    const enclosesChildren =
      enclosed || nesting || (node.isNamed && enclosingTypes.includes(node.type));

    let childMax = 0;
    for (const child of node.children) {
      childMax = Math.max(childMax, visit(child, depth + 1, enclosesChildren));
    }

    // Matches calculateNestingDepth, which never counts the starting node itself,
    // and the MAX_WALK_DEPTH cut-off of the walk this replaced.
    if (childMax > 0 && depth <= MAX_WALK_DEPTH) depths.push(childMax);

    const isDefinition = !enclosed && ANONYMOUS_FUNCTION_TYPES.includes(node.type);
    return nesting && !isDefinition ? childMax + 1 : childMax;
  }

  visit(rootNode, 0, false);
  return depths;
}

/** Recursive helper that counts nesting for the given node and its descendants. */
function walkNestingDepth(
  node: Parser.SyntaxNode,
  currentDepth: number,
  language: SupportedLanguage
): number {
  const newDepth = isNestingNode(node, language) ? currentDepth + 1 : currentDepth;

  let maxDepth = newDepth;

  for (const child of node.children) {
    const childDepth = walkNestingDepth(child, newDepth, language);
    maxDepth = Math.max(maxDepth, childDepth);
  }

  return maxDepth;
}

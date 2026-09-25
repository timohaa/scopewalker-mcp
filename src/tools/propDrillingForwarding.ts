import type Parser from "tree-sitter";
import { walkNode } from "../lib/astWalker.js";
import type { SupportedLanguage } from "../types/index.js";

/** The parameters being tracked through one function body, and those seen forwarded so far. */
interface ForwardingState {
  paramSet: Set<string>;
  forwarded: Set<string>;
}

/** Checks if an identifier or member_expression node forwards a tracked parameter. */
function checkNodeForwarding(node: Parser.SyntaxNode, state: ForwardingState): void {
  if (node.type === "identifier" && state.paramSet.has(node.text)) {
    state.forwarded.add(node.text);
    return;
  }
  if (node.type === "member_expression" && node.namedChildren.length > 0) {
    const obj = node.namedChildren[0];
    if (obj.type === "identifier" && state.paramSet.has(obj.text)) {
      state.forwarded.add(obj.text);
    }
  }
}

/**
 * Detects which received parameters are forwarded to child calls or JSX attributes.
 * Returns the subset of paramNames that appear as arguments in call expressions
 * or as JSX attribute values.
 */
export function detectForwardedParameters(
  funcNode: Parser.SyntaxNode,
  paramNames: string[],
  _language: SupportedLanguage
): string[] {
  if (paramNames.length === 0) return [];

  const state: ForwardingState = { paramSet: new Set(paramNames), forwarded: new Set<string>() };

  const body = findFunctionBody(funcNode);
  if (body === null) return [];

  walkNode(body, (node) => {
    collectForwardingFromNode(node, state);
  });

  return [...state.forwarded];
}

// "arguments" in TS/JS/Rust, "argument_list" in Python/Go/Java/C/Ruby — both are
// the call-expression argument container: someFunc(userId).
const ARGUMENT_CONTAINER_TYPES = ["arguments", "argument_list"];

/** Records any tracked parameter this node forwards onward. */
function collectForwardingFromNode(node: Parser.SyntaxNode, state: ForwardingState): void {
  if (ARGUMENT_CONTAINER_TYPES.includes(node.type)) {
    for (const child of node.namedChildren) checkNodeForwarding(child, state);
    return;
  }

  // JSX attribute value forwarding: <Child userId={userId} />
  if (node.type === "jsx_attribute") {
    checkJsxAttributeForwarding(node, state);
    return;
  }

  // JSX spread: <Child {...props} /> — jsx_expression > spread_element > identifier
  if (node.type === "spread_element") {
    for (const child of node.namedChildren) {
      if (child.type === "identifier" && state.paramSet.has(child.text)) {
        state.forwarded.add(child.text);
      }
    }
  }
}

/** Checks if a JSX expression node forwards tracked parameters, including shorthand {prop}. */
function checkJsxExpressionForwarding(
  jsxExprNode: Parser.SyntaxNode,
  attrName: string | null,
  state: ForwardingState
): void {
  for (const exprChild of jsxExprNode.namedChildren) {
    checkNodeForwarding(exprChild, state);
  }
  // Shorthand: <Child userId={userId} /> where attr name matches expr identifier
  if (attrName !== null && state.paramSet.has(attrName) && jsxExprNode.namedChildren.length === 1) {
    const exprChild = jsxExprNode.namedChildren[0];
    if (exprChild.type === "identifier" && exprChild.text === attrName) {
      state.forwarded.add(attrName);
    }
  }
}

/** Checks if a JSX attribute forwards a parameter: propName={paramName}. */
function checkJsxAttributeForwarding(node: Parser.SyntaxNode, state: ForwardingState): void {
  let attrName: string | null = null;

  for (const child of node.children) {
    if (child.type === "property_identifier") {
      attrName = child.text;
    }
    if (child.type === "jsx_expression") {
      checkJsxExpressionForwarding(child, attrName, state);
    }
  }
}

/** Finds the body/block node of a function. */
function findFunctionBody(funcNode: Parser.SyntaxNode): Parser.SyntaxNode | null {
  const BODY_TYPES = new Set([
    "statement_block",
    "block",
    "function_body",
    "body",
    "body_statement",
    "compound_statement",
  ]);
  for (const child of funcNode.children) {
    if (BODY_TYPES.has(child.type)) return child;
  }
  // Arrow functions may have expression bodies
  if (funcNode.type === "arrow_function") {
    const last = funcNode.namedChildren.at(-1);
    if (last !== undefined && last.type !== "formal_parameters") return last;
  }
  return null;
}

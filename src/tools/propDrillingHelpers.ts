import type Parser from "tree-sitter";
import { walkNode } from "../lib/astWalker.js";
import type { SupportedLanguage } from "../types/index.js";

/** Finds the parameter list node within a function node. */
function findParamListNode(funcNode: Parser.SyntaxNode): Parser.SyntaxNode | null {
  for (const child of funcNode.children) {
    if (
      child.type === "formal_parameters" ||
      child.type === "parameters" ||
      child.type === "parameter_list" ||
      child.type === "method_parameters"
    ) {
      return child;
    }
  }
  return null;
}

/**
 * Extracts parameter names from a function node.
 * Handles typed params, destructured params, rest params across languages.
 */
export function extractParameterNames(
  funcNode: Parser.SyntaxNode,
  language: SupportedLanguage
): string[] {
  const paramListNode = findParamListNode(funcNode);
  if (paramListNode === null) return [];

  const names: string[] = [];

  if (language === "python") {
    extractPythonParamNames(paramListNode, names);
  } else {
    extractGenericParamNames(paramListNode, names, language);
  }

  return names;
}

/** Extracts Python parameter names, skipping self/cls/*args/**kwargs. */
function extractPythonParamNames(paramListNode: Parser.SyntaxNode, names: string[]): void {
  let isFirst = true;

  for (const child of paramListNode.namedChildren) {
    if (child.type === "keyword_separator") continue;
    if (child.type === "list_splat_pattern" || child.type === "dictionary_splat_pattern") continue;

    if (isFirst) {
      isFirst = false;
      const paramName = child.type === "identifier" ? child.text : null;
      if (paramName === "self" || paramName === "cls") continue;
    }

    if (child.type === "identifier") {
      names.push(child.text);
    } else if (child.type === "typed_parameter" || child.type === "default_parameter") {
      const id = child.namedChildren.find((c) => c.type === "identifier");
      if (id !== undefined) names.push(id.text);
    }
  }
}

/** Extracts parameter names for TS/JS/Go/Rust/Java/C/C++/Ruby. */
function extractGenericParamNames(
  paramListNode: Parser.SyntaxNode,
  names: string[],
  language: SupportedLanguage
): void {
  for (const child of paramListNode.namedChildren) {
    extractNamesFromParamNode(child, names, language);
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

/** Recursively extracts identifiers from a single parameter node. */
function extractNamesFromParamNode(
  node: Parser.SyntaxNode,
  names: string[],
  language: SupportedLanguage
): void {
  switch (node.type) {
    case "identifier":
      names.push(node.text);
      return;

    // TS/JS destructured object parameter: { userId, theme }
    case "object_pattern":
      extractObjectPatternNames(node, names);
      return;

    // TS/JS array destructuring: [first, second]
    case "array_pattern":
      for (const child of node.namedChildren) {
        if (child.type === "identifier") names.push(child.text);
      }
      return;

    // TS/JS rest parameter: ...rest
    case "rest_pattern":
      for (const child of node.namedChildren) {
        if (child.type === "identifier") names.push(child.text);
      }
      return;

    // TS typed params: required_parameter, optional_parameter
    case "required_parameter":
    case "optional_parameter": {
      if (node.namedChildren.length > 0) {
        extractNamesFromParamNode(node.namedChildren[0], names, language);
      }
      return;
    }

    // Go/C/C++: parameter_declaration — `name Type`
    case "parameter_declaration": {
      const deepId = findDeepIdentifier(node);
      if (deepId !== null) names.push(deepId);
      return;
    }

    // Rust: parameter — pattern: Type
    case "parameter": {
      const rustId = extractFirstIdentifierChild(node);
      if (rustId !== null) names.push(rustId);
      return;
    }

    // Java: formal_parameter — Type name
    case "formal_parameter": {
      const id = findDeepIdentifier(node);
      if (id !== null) names.push(id);
      return;
    }

    // Fallback: try to find an identifier child
    default: {
      const fallbackId = extractFirstIdentifierChild(node);
      if (fallbackId !== null) names.push(fallbackId);
    }
  }
}

/** Finds an identifier deep in a parameter declaration (for C/Java where declarators nest). */
function findDeepIdentifier(node: Parser.SyntaxNode): string | null {
  for (const child of node.namedChildren) {
    if (child.type === "identifier") return child.text;
  }
  for (const child of node.namedChildren) {
    if (child.type.includes("declarator")) {
      for (const grandchild of child.namedChildren) {
        if (grandchild.type === "identifier") return grandchild.text;
      }
    }
  }
  return null;
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

  const paramSet = new Set(paramNames);
  const forwarded = new Set<string>();

  const body = findFunctionBody(funcNode);
  if (body === null) return [];

  walkNode(body, (node) => {
    // Check call expression arguments: someFunc(userId)
    if (node.type === "arguments") {
      for (const child of node.namedChildren) {
        if (child.type === "identifier" && paramSet.has(child.text)) {
          forwarded.add(child.text);
        }
      }
    }

    // Check JSX attributes: <Child userId={userId} />
    if (node.type === "jsx_attribute") {
      checkJsxAttributeForwarding(node, paramSet, forwarded);
    }

    // Check JSX spread: <Child {...props} />
    // tree-sitter parses this as jsx_expression > spread_element > identifier
    if (node.type === "spread_element") {
      for (const child of node.namedChildren) {
        if (child.type === "identifier" && paramSet.has(child.text)) {
          forwarded.add(child.text);
        }
      }
    }
  });

  return [...forwarded];
}

/** Checks if a JSX attribute forwards a parameter: propName={paramName}. */
function checkJsxAttributeForwarding(
  node: Parser.SyntaxNode,
  paramSet: Set<string>,
  forwarded: Set<string>
): void {
  let attrName: string | null = null;

  for (const child of node.children) {
    if (child.type === "property_identifier") {
      attrName = child.text;
    }
    if (child.type === "jsx_expression") {
      for (const exprChild of child.namedChildren) {
        if (exprChild.type === "identifier" && paramSet.has(exprChild.text)) {
          forwarded.add(exprChild.text);
        }
      }
      if (attrName !== null && paramSet.has(attrName) && child.namedChildren.length === 1) {
        const exprChild = child.namedChildren[0];
        if (exprChild.type === "identifier" && exprChild.text === attrName) {
          forwarded.add(attrName);
        }
      }
    }
  }
}

/** Finds the body/block node of a function. */
function findFunctionBody(funcNode: Parser.SyntaxNode): Parser.SyntaxNode | null {
  for (const child of funcNode.children) {
    if (
      child.type === "statement_block" ||
      child.type === "block" ||
      child.type === "function_body" ||
      child.type === "body" ||
      child.type === "compound_statement"
    ) {
      return child;
    }
  }
  // Arrow functions may have expression bodies
  if (funcNode.type === "arrow_function") {
    const namedChildren = funcNode.namedChildren;
    const lastIdx = namedChildren.length - 1;
    if (lastIdx >= 0 && namedChildren[lastIdx].type !== "formal_parameters") {
      return namedChildren[lastIdx];
    }
  }
  return null;
}

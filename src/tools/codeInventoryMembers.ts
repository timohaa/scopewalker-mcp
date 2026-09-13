import type Parser from "tree-sitter";
import type { SupportedLanguage } from "../types/index.js";
import { extractDeclaratorName, findFunctionDeclarator } from "./codeInventoryCpp.js";
import { rubyBodyMembers } from "./codeInventoryRuby.js";

const METHOD_TYPES = [
  "method_definition",
  "method_declaration",
  "function_definition",
  "public_method_definition",
  "method",
  "singleton_method",
  // A Java constructor is a member function under a node type of its own.
  "constructor_declaration",
  // TypeScript spells a body-less member of an abstract class this way.
  "abstract_method_signature",
  // Rust trait members: a required signature and a provided default method.
  "function_signature_item",
  "function_item",
];

// C/C++ members declared without a body share a node type with data fields, and
// constructors and destructors take `declaration` because they have no return type.
const DECLARATION_TYPES = ["field_declaration", "declaration"];

// Values that make a TS/JS class field a method: `handleClick = (e) => {}`.
const FUNCTION_VALUE_TYPES = ["arrow_function", "function_expression", "function"];

/** Checks whether a TS/JS class field binds a function rather than a value. */
export function isFieldMethod(node: Parser.SyntaxNode): boolean {
  return (
    node.type === "public_field_definition" &&
    node.children.some((child) => FUNCTION_VALUE_TYPES.includes(child.type))
  );
}

/** Checks if an AST node represents a method definition. */
export function isMethodNode(node: Parser.SyntaxNode): boolean {
  if (METHOD_TYPES.includes(node.type)) return true;
  if (isFieldMethod(node)) return true;

  return DECLARATION_TYPES.includes(node.type) && findFunctionDeclarator(node) !== null;
}

// Ruby names operators and setters with node types of their own, and TS gives
// `#private` fields one too.
const METHOD_NAME_TYPES = [
  "identifier",
  "property_identifier",
  "field_identifier",
  "private_property_identifier",
  "operator",
  "setter",
];

/** Extracts the method name from a method definition node. */
export function extractMethodName(node: Parser.SyntaxNode): string | null {
  for (const child of node.children) {
    if (METHOD_NAME_TYPES.includes(child.type)) {
      return child.text;
    }
    // C/C++ nest the member name inside its declarator.
    if (child.type === "function_declarator") {
      return extractDeclaratorName(child);
    }
  }

  // A pointer-returning member keeps its declarator below a pointer_declarator.
  const declarator = findFunctionDeclarator(node);
  return declarator ? extractDeclaratorName(declarator) : null;
}

/** Unwraps a Python `decorated_definition` to the `def` or `class` it decorates. */
function unwrapDecorated(node: Parser.SyntaxNode): Parser.SyntaxNode {
  if (node.type !== "decorated_definition") return node;

  const definition = node.children.find(
    (child) => child.type === "function_definition" || child.type === "class_definition"
  );
  return definition ?? node;
}

/**
 * Lists the member nodes of a class body.
 *
 * Two grammars put a member somewhere other than directly under the body: Ruby
 * allows a `def` inside a conditional, and Python wraps a decorated `def` in a
 * `decorated_definition`.
 */
export function bodyMembers(
  body: Parser.SyntaxNode,
  language: SupportedLanguage
): Parser.SyntaxNode[] {
  if (language === "ruby") return rubyBodyMembers(body);
  if (language === "python") return body.children.map(unwrapDecorated);

  return [...body.children];
}

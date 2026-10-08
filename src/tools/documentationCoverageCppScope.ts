import type Parser from "tree-sitter";
import { isInsideRecordBody } from "./documentationCoverageClassification.js";

/** C/C++ records that open a scope for the members declared inside them. */
const RECORD_TYPES = new Set(["class_specifier", "struct_specifier", "union_specifier"]);

/**
 * Reads a member's access from the last `public:`/`private:`/`protected:` label
 * above it. Members before any label take the record's default: `class` is
 * private, `struct` and `union` are public.
 */
function memberAccess(member: Parser.SyntaxNode, body: Parser.SyntaxNode): string {
  for (let sibling = member.previousSibling; sibling !== null; sibling = sibling.previousSibling) {
    if (sibling.type === "access_specifier") return sibling.text;
  }
  return body.parent?.type === "class_specifier" ? "private" : "public";
}

/**
 * True when the node, or a record it is nested in, is a private member.
 * `protected` members stay visible because subclasses use them as API.
 */
function isPrivateMember(node: Parser.SyntaxNode): boolean {
  for (let current: Parser.SyntaxNode | null = node; current !== null; current = current.parent) {
    const parent = current.parent;
    if (parent?.type !== "field_declaration_list") continue;
    if (memberAccess(current, parent) === "private") return true;
  }
  return false;
}

/** True when the node sits inside `namespace { ... }`, which has internal linkage. */
function isInAnonymousNamespace(node: Parser.SyntaxNode): boolean {
  for (let current = node.parent; current !== null; current = current.parent) {
    if (current.type === "namespace_definition" && current.childForFieldName("name") === null) {
      return true;
    }
  }
  return false;
}

/** True for a `static` free function, which is visible only in its own file. */
function isStaticFreeFunction(node: Parser.SyntaxNode): boolean {
  const isStatic = node.children.some(
    (child) => child.type === "storage_class_specifier" && child.text === "static"
  );
  return isStatic && !isInsideRecordBody(node);
}

/**
 * True when a C/C++ symbol is not part of any public API: a private member, a
 * `static` free function, or anything in an anonymous namespace.
 */
export function isHiddenCSymbol(node: Parser.SyntaxNode): boolean {
  return isStaticFreeFunction(node) || isInAnonymousNamespace(node) || isPrivateMember(node);
}

/**
 * Drops template arguments from each `::` segment, so the out-of-line
 * `Box<T>::get` matches the `get` declared inside `template <class T> class Box`.
 * Operator segments keep their angle brackets (`operator<<`).
 */
function normalizeQualifiedName(name: string): string {
  return name
    .replace(/\s+/g, "")
    .replace(/^::/, "")
    .split("::")
    .map((segment) => {
      if (segment.startsWith("operator")) return segment;
      let stripped = segment;
      while (/<[^<>]*>/.test(stripped)) stripped = stripped.replace(/<[^<>]*>/g, "");
      return stripped;
    })
    .join("::");
}

/** Names of the namespaces and records enclosing a node, outermost first. */
function enclosingScopes(node: Parser.SyntaxNode): string[] {
  const scopes: string[] = [];
  for (let current = node.parent; current !== null; current = current.parent) {
    const isScope = current.type === "namespace_definition" || RECORD_TYPES.has(current.type);
    const name = isScope ? current.childForFieldName("name") : null;
    if (name !== null) scopes.unshift(name.text);
  }
  return scopes;
}

/**
 * Builds the key that joins a header declaration with its definition in
 * another file: the fully qualified name, prefixed with the symbol kind so a
 * `struct stat` and a `stat()` function stay apart.
 */
export function cSymbolKey(node: Parser.SyntaxNode, name: string, isClass: boolean): string {
  const qualified = normalizeQualifiedName([...enclosingScopes(node), name].join("::"));
  return `${isClass ? "class" : "function"}:${qualified}`;
}

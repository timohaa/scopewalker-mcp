import type Parser from "tree-sitter";

/**
 * Shared parameter-node conventions.
 *
 * Both the prop-drilling and complexity tools have to locate a function's
 * parameter list and apply the same Python receiver rules. They previously kept
 * private copies that drifted: only one learned to prefer the `parameters`
 * field and to recurse into C/C++ declarators, so prop drilling reported Go
 * receivers as parameters and saw no C/C++ parameters at all. One
 * implementation, so a fix cannot reach only half the callers.
 */

// Parameter-list node types across grammars: TS/JS (formal_parameters),
// Python/Rust (parameters), C/C++/Go (parameter_list), Ruby (method_parameters).
export const PARAM_LIST_TYPES = [
  "formal_parameters",
  "parameters",
  "parameter_list",
  "method_parameters",
];

/**
 * Locates a function's parameter list.
 * The named field is preferred because Go's method_declaration also carries a
 * receiver parameter_list, which a positional scan would match first.
 * C/C++ expose no such field and nest the list inside the declarator instead.
 */
export function findParameterList(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
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

// `*` marks keyword-only params, `*args`/`**kwargs` are variadic; none is a
// positional parameter that a caller could pass or thread onward.
export const PYTHON_NON_PARAMETER_TYPES = [
  "keyword_separator",
  "list_splat_pattern",
  "dictionary_splat_pattern",
];

/** Returns true for the implicit method receiver in `def m(self, ...)`. */
export function isPythonReceiver(child: Parser.SyntaxNode): boolean {
  if (child.type !== "identifier") return false;
  return child.text === "self" || child.text === "cls";
}

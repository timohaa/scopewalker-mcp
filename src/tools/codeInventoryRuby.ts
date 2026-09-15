import type Parser from "tree-sitter";

// Ruby conditionals are expressions, so a `def` inside one still defines a
// method on the enclosing class. These node types only wrap the definition.
const CONDITIONAL_WRAPPERS = ["if", "unless", "elsif", "else", "then", "begin", "ensure", "rescue"];

/** Checks whether a node stands between a class body and a `def` nested in a conditional. */
function isWrapper(node: Parser.SyntaxNode): boolean {
  if (CONDITIONAL_WRAPPERS.includes(node.type)) return true;

  // `begin ... end` holds its statements in a body_statement of its own.
  const parent = node.parent;
  return (
    node.type === "body_statement" && parent !== null && CONDITIONAL_WRAPPERS.includes(parent.type)
  );
}

/** Lists a Ruby body's members, seeing through conditionals wrapped around a `def`. */
export function rubyBodyMembers(body: Parser.SyntaxNode): Parser.SyntaxNode[] {
  const members: Parser.SyntaxNode[] = [];

  for (const child of body.children) {
    if (isWrapper(child)) {
      members.push(...rubyBodyMembers(child));
    } else {
      members.push(child);
    }
  }

  return members;
}

/**
 * Checks whether a Ruby `def` is a member of a class body.
 *
 * The def may sit inside an `if` or a `begin` and still be a member, so the
 * walk climbs past those wrappers before reading the owner.
 */
export function isRubyClassMember(node: Parser.SyntaxNode): boolean {
  let current = node.parent;
  while (current !== null && isWrapper(current)) {
    current = current.parent;
  }

  if (current?.type !== "body_statement") return false;

  const owner = current.parent?.type;
  return owner === "class" || owner === "singleton_class";
}

/** Checks whether a Ruby `def` belongs to a module body, through conditional wrappers. */
export function isRubyModuleMember(node: Parser.SyntaxNode): boolean {
  let current = node.parent;
  while (current !== null && isWrapper(current)) {
    current = current.parent;
  }

  return current?.type === "body_statement" && current.parent?.type === "module";
}

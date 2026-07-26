import type Parser from "tree-sitter";
import { walkNode } from "../lib/astWalker.js";
import type { InventoryItem, MethodInfo } from "../types/index.js";
import { isPrivateSymbol } from "./codeInventoryHelpers.js";

/**
 * Resolves the type a Go method is declared on.
 * The receiver is a parameter list, and its type may be wrapped in a pointer
 * (`*Point`) or a generic instantiation (`Stack[T]`), so the first
 * type_identifier anywhere beneath it is the name being extended.
 */
function getReceiverTypeName(receiver: Parser.SyntaxNode): string | null {
  let name: string | null = null;

  walkNode(receiver, (node) => {
    if (name === null && node.type === "type_identifier") {
      name = node.text;
    }
  });

  return name;
}

/**
 * Attaches Go methods to the types they extend.
 * Go declares methods outside the type body, so the walk that builds items
 * cannot nest them; this pairs them up afterwards by receiver name. Methods on
 * types declared in another file have no local item and are left out.
 */
export function attachGoMethods(
  rootNode: Parser.SyntaxNode,
  items: InventoryItem[],
  includePrivate: boolean
): void {
  const byName = new Map(items.map((item) => [item.name, item]));

  walkNode(rootNode, (node) => {
    if (node.type !== "method_declaration") return;

    const receiver = node.childForFieldName("receiver");
    const nameNode = node.childForFieldName("name");
    if (!receiver || !nameNode) return;

    const typeName = getReceiverTypeName(receiver);
    if (typeName === null) return;

    const target = byName.get(typeName);
    if (!target) return;

    const isPrivate = isPrivateSymbol(nameNode.text, node, "go");
    if (isPrivate && !includePrivate) return;

    const method: MethodInfo = {
      name: nameNode.text,
      line: node.startPosition.row + 1,
      visibility: isPrivate ? "private" : "public",
    };

    target.methods = [...(target.methods ?? []), method];
  });
}

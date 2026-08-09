import type Parser from "tree-sitter";
import type { MethodVisibility, SupportedLanguage } from "../types/index.js";

/** The three access keywords, spelled the same way in C++ and Ruby. */
const VISIBILITY_KEYWORDS: Record<string, MethodVisibility> = {
  public: "public",
  private: "private",
  protected: "protected",
};

/**
 * Ruby calls that take method definitions or symbols as arguments rather than
 * opening a section: `private def x`, `private :a, :b`.
 */
const RUBY_ARGUMENT_MARKERS: Record<string, MethodVisibility> = {
  ...VISIBILITY_KEYWORDS,
  private_class_method: "private",
  public_class_method: "public",
};

const RUBY_METHOD_TYPES = ["method", "singleton_method"];

/**
 * The visibility a member has before any marker appears in the class body.
 *
 * Only C++ makes this depend on the declaration: `class` members start private
 * and `struct` members start public, which is the one place the same body node
 * means two different things.
 */
export function defaultSectionVisibility(
  classNode: Parser.SyntaxNode,
  language: SupportedLanguage
): MethodVisibility {
  if (language === "cpp" && classNode.type === "class_specifier") return "private";
  return "public";
}

/**
 * Reads a marker that changes visibility for the members that follow it.
 *
 * C++ spells this `private:` as a sibling label; Ruby spells it as a bare
 * `private` with no arguments. Both govern position rather than a named target,
 * so callers apply the result to everything they see afterwards.
 */
export function readSectionMarker(
  node: Parser.SyntaxNode,
  language: SupportedLanguage
): MethodVisibility | null {
  // The grammar keeps the trailing colon in a sibling node, so the label's own
  // text is the bare keyword.
  if ((language === "cpp" || language === "c") && node.type === "access_specifier") {
    return VISIBILITY_KEYWORDS[node.text] ?? null;
  }

  if (language === "ruby" && node.type === "identifier") {
    return VISIBILITY_KEYWORDS[node.text] ?? null;
  }

  return null;
}

/** A Ruby method defined inline as the argument of a visibility call. */
export interface InlineVisibilityMethod {
  methodNode: Parser.SyntaxNode;
  visibility: MethodVisibility;
}

/**
 * Reads Ruby's `private def x; end` form.
 *
 * The method is nested inside the call's `argument_list`, so it is not a direct
 * child of the class body and is invisible to a caller that only scans siblings.
 */
export function readInlineVisibilityCall(
  node: Parser.SyntaxNode,
  language: SupportedLanguage
): InlineVisibilityMethod[] {
  const call = readVisibilityCall(node, language);
  if (!call) return [];

  return call.args
    .filter((arg) => RUBY_METHOD_TYPES.includes(arg.type))
    .map((methodNode) => ({ methodNode, visibility: call.visibility }));
}

/** Method names a Ruby visibility call marks after the fact, e.g. `private :a, :b`. */
export interface RetroactiveMarks {
  names: string[];
  visibility: MethodVisibility;
}

/**
 * Reads Ruby's `private :a, :b` form, which names methods already defined above
 * it. Callers can only apply these once the whole body has been read.
 */
export function readRetroactiveMarks(
  node: Parser.SyntaxNode,
  language: SupportedLanguage
): RetroactiveMarks | null {
  const call = readVisibilityCall(node, language);
  if (!call) return null;

  const names = call.args
    .filter((arg) => arg.type === "simple_symbol")
    .map((arg) => arg.text.replace(/^:/, ""));

  return names.length > 0 ? { names, visibility: call.visibility } : null;
}

/** Shared shape behind both Ruby argument forms: a visibility call and its arguments. */
function readVisibilityCall(
  node: Parser.SyntaxNode,
  language: SupportedLanguage
): { visibility: MethodVisibility; args: Parser.SyntaxNode[] } | null {
  if (language !== "ruby" || node.type !== "call") return null;

  const receiver = node.children.find((child) => child.type === "identifier");
  const visibility = receiver ? RUBY_ARGUMENT_MARKERS[receiver.text] : undefined;
  if (visibility === undefined) return null;

  const argumentList = node.children.find((child) => child.type === "argument_list");
  return argumentList ? { visibility, args: [...argumentList.namedChildren] } : null;
}

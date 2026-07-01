import type Parser from "tree-sitter";
import { describe, expect, it } from "vitest";
import { parseCode } from "../lib/treeSitter.js";
import type { SupportedLanguage } from "../types/index.js";
import { extractParameterNames, detectForwardedParameters } from "./propDrillingHelpers.js";

/** Parses code and returns the first function node, throwing if not found. */
async function getFirstFunction(
  code: string,
  language: SupportedLanguage
): Promise<Parser.SyntaxNode> {
  const tree = await parseCode(code, language);
  if (tree === null) throw new Error("Failed to parse code");

  const funcTypes = [
    "function_declaration",
    "function_definition",
    "method_definition",
    "method_declaration",
    "arrow_function",
    "function_expression",
  ];

  function find(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    if (funcTypes.includes(node.type)) return node;
    for (const child of node.children) {
      const result = find(child);
      if (result !== null) return result;
    }
    return null;
  }

  const result = find(tree.rootNode);
  if (result === null) throw new Error("No function node found");
  return result;
}

/** Finds first node of a specific type in the AST, throwing if not found. */
async function findNodeByType(
  code: string,
  language: SupportedLanguage,
  nodeType: string
): Promise<Parser.SyntaxNode> {
  const tree = await parseCode(code, language);
  if (tree === null) throw new Error("Failed to parse code");

  function find(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
    if (node.type === nodeType) return node;
    for (const child of node.children) {
      const result = find(child);
      if (result !== null) return result;
    }
    return null;
  }

  const result = find(tree.rootNode);
  if (result === null) throw new Error(`No ${nodeType} node found`);
  return result;
}

describe("extractParameterNames - common cases", () => {
  it("extracts simple typed TS parameters", async () => {
    const func = await getFirstFunction(
      `function greet(name: string, age: number): void {}`,
      "typescript"
    );
    const names = extractParameterNames(func, "typescript");
    expect(names).toEqual(["name", "age"]);
  });

  it("extracts destructured object parameters", async () => {
    const func = await getFirstFunction(
      `function render({ userId, theme }: Props): void {}`,
      "typescript"
    );
    const names = extractParameterNames(func, "typescript");
    expect(names).toEqual(["userId", "theme"]);
  });

  it("extracts arrow function parameters", async () => {
    const code = `const fn = (userId: string, isAdmin: boolean) => {};`;
    const arrowNode = await findNodeByType(code, "typescript", "arrow_function");
    const names = extractParameterNames(arrowNode, "typescript");
    expect(names).toEqual(["userId", "isAdmin"]);
  });

  it("extracts rest parameter names", async () => {
    const func = await getFirstFunction(
      `function log(message: string, ...args: unknown[]): void {}`,
      "typescript"
    );
    const names = extractParameterNames(func, "typescript");
    expect(names).toContain("message");
    expect(names).toContain("args");
  });

  it("extracts Python parameters, skipping self", async () => {
    const func = await getFirstFunction(`def render(self, user_id, theme):\n    pass`, "python");
    const names = extractParameterNames(func, "python");
    expect(names).toEqual(["user_id", "theme"]);
  });

  it("extracts Go parameter names", async () => {
    const func = await getFirstFunction(
      `func handler(w http.ResponseWriter, r *http.Request) {}`,
      "go"
    );
    const names = extractParameterNames(func, "go");
    expect(names).toContain("w");
    expect(names).toContain("r");
  });
});

describe("extractParameterNames - additional languages and patterns", () => {
  it("extracts Java parameter names", async () => {
    const code = `class Foo { void process(String userId, int count) {} }`;
    const methodNode = await findNodeByType(code, "java", "method_declaration");
    const names = extractParameterNames(methodNode, "java");
    expect(names).toContain("userId");
    expect(names).toContain("count");
  });

  it("returns empty array for parameterless function", async () => {
    const func = await getFirstFunction(`function doSomething(): void {}`, "typescript");
    const names = extractParameterNames(func, "typescript");
    expect(names).toEqual([]);
  });

  it("extracts array destructuring parameters", async () => {
    const func = await getFirstFunction(
      `function swap([first, second]: string[]): void {}`,
      "typescript"
    );
    const names = extractParameterNames(func, "typescript");
    expect(names).toContain("first");
    expect(names).toContain("second");
  });

  it("extracts renamed destructuring parameters: { userId: id }", async () => {
    const func = await getFirstFunction(
      `function render({ userId: id, theme: t }: Props): void {}`,
      "typescript"
    );
    const names = extractParameterNames(func, "typescript");
    expect(names).toContain("id");
    expect(names).toContain("t");
  });

  it("extracts Rust parameter names", async () => {
    const func = await findNodeByType(
      `fn handle(user_id: String, count: u32) -> bool { true }`,
      "rust",
      "function_item"
    );
    const names = extractParameterNames(func, "rust");
    expect(names).toContain("user_id");
    expect(names).toContain("count");
  });

  it("extracts optional TS parameter names", async () => {
    const func = await getFirstFunction(
      `function greet(name: string, title?: string): void {}`,
      "typescript"
    );
    const names = extractParameterNames(func, "typescript");
    expect(names).toContain("name");
    expect(names).toContain("title");
  });
});

describe("detectForwardedParameters", () => {
  it("detects parameters forwarded to call expressions", async () => {
    const func = await getFirstFunction(
      `function wrapper(userId: string, theme: string): void {
        renderChild(userId);
        console.log(theme);
      }`,
      "typescript"
    );
    const forwarded = detectForwardedParameters(func, ["userId", "theme"], "typescript");
    expect(forwarded).toContain("userId");
    expect(forwarded).toContain("theme");
  });

  it("detects JSX attribute forwarding via member expression", async () => {
    const code = `function Layout(props: { userId: string }) {
      return <Sidebar userId={props.userId} />;
    }`;
    const funcNode = await getFirstFunction(code, "typescript");

    const forwarded = detectForwardedParameters(funcNode, ["props"], "typescript");
    expect(forwarded).toContain("props");
  });

  it("detects member expression forwarding in call arguments", async () => {
    const code = `function wrapper(config: Config): void {
      init(config.apiKey);
    }`;
    const func = await getFirstFunction(code, "typescript");
    const forwarded = detectForwardedParameters(func, ["config"], "typescript");
    expect(forwarded).toContain("config");
  });

  it("detects spread attribute forwarding", async () => {
    const code = `function Wrapper(props: Props) {
      return <Child {...props} />;
    }`;
    const funcNode = await getFirstFunction(code, "typescript");

    const forwarded = detectForwardedParameters(funcNode, ["props"], "typescript");
    expect(forwarded).toContain("props");
  });

  it("returns empty for parameters not forwarded", async () => {
    const func = await getFirstFunction(
      `function process(userId: string): void {
        const result = userId.toUpperCase();
        return;
      }`,
      "typescript"
    );
    // userId is used via method call on itself, not passed as argument to another function
    const forwarded = detectForwardedParameters(func, ["userId"], "typescript");
    expect(forwarded).toEqual([]);
  });

  it("returns empty array when paramNames is empty", async () => {
    const func = await getFirstFunction(
      `function noParams(): void { doSomething(); }`,
      "typescript"
    );
    const forwarded = detectForwardedParameters(func, [], "typescript");
    expect(forwarded).toEqual([]);
  });

  it("detects forwarding in arrow function with expression body", async () => {
    const code = `const fn = (userId: string) => process(userId);`;
    const arrowNode = await findNodeByType(code, "typescript", "arrow_function");
    const forwarded = detectForwardedParameters(arrowNode, ["userId"], "typescript");
    expect(forwarded).toContain("userId");
  });

  it("detects JSX direct attribute forwarding: prop={prop}", async () => {
    const code = `function Widget({ userId }: Props) {
      return <Child userId={userId} />;
    }`;
    const funcNode = await getFirstFunction(code, "typescript");
    const forwarded = detectForwardedParameters(funcNode, ["userId"], "typescript");
    expect(forwarded).toContain("userId");
  });
});

import { describe, it, expect } from "vitest";
import { getFunctions, parseCode, detectLanguage } from "./treeSitter.js";

describe("C language support", () => {
  it("detects C language from .c extension", () => {
    expect(detectLanguage("main.c")).toBe("c");
    expect(detectLanguage("utils.h")).toBe("c");
  });

  it("extracts C functions", async () => {
    const code = `
int main(void) {
    return 0;
}

void helper(int x) {
    printf("%d", x);
}
`;
    const functions = await getFunctions(code, "c");
    expect(functions.length).toBe(2);
    expect(functions.map((f) => f.name)).toContain("main");
    expect(functions.map((f) => f.name)).toContain("helper");
  });

  it("parses C code and returns AST", async () => {
    const code = `int foo(void) { return 42; }`;
    const tree = await parseCode(code, "c");
    expect(tree).not.toBeNull();
    expect(tree?.rootNode.type).toBe("translation_unit");
  });

  it("extracts C functions with correct line numbers", async () => {
    const code = `// comment
int first(void) {
    return 1;
}

int second(void) {
    return 2;
}`;
    const functions = await getFunctions(code, "c");
    const first = functions.find((f) => f.name === "first");
    const second = functions.find((f) => f.name === "second");

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first?.startLine).toBe(2);
    expect(second?.startLine).toBe(6);
  });
});

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type Parser from "tree-sitter";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as TreeSitterModule from "../lib/treeSitter.js";
import type { SupportedLanguage } from "../types/index.js";
import type { FileParameterAnalysis } from "../types/propDrilling.js";
import { aggregateParameters, analyzeFilesForParameters } from "./propDrillingAnalysis.js";

// A file containing this marker simulates a parser that returns no tree (as
// happens when a grammar fails to load), so tests can verify the file is
// skipped instead of aborting the whole scan.
vi.mock("../lib/treeSitter.js", async (importOriginal) => {
  const actual = await importOriginal<typeof TreeSitterModule>();
  const parseCode = async (
    code: string,
    language: SupportedLanguage
  ): Promise<Parser.Tree | null> => {
    if (code.includes("// NO_TREE")) {
      return null;
    }
    return actual.parseCode(code, language);
  };
  return { ...actual, parseCode: vi.fn(parseCode) };
});

describe("aggregateParameters", () => {
  it("groups parameters across files and assigns risk", () => {
    const analyses: FileParameterAnalysis[] = [
      {
        path: "Page.tsx",
        language: "typescript",
        parameters: [
          { name: "userId", functionName: "Page", line: 1, isForwarded: true },
          { name: "theme", functionName: "Page", line: 1, isForwarded: true },
        ],
      },
      {
        path: "Layout.tsx",
        language: "typescript",
        parameters: [
          { name: "userId", functionName: "Layout", line: 1, isForwarded: true },
          { name: "theme", functionName: "Layout", line: 1, isForwarded: false },
        ],
      },
      {
        path: "Sidebar.tsx",
        language: "typescript",
        parameters: [{ name: "userId", functionName: "Sidebar", line: 1, isForwarded: true }],
      },
      {
        path: "UserMenu.tsx",
        language: "typescript",
        parameters: [{ name: "userId", functionName: "UserMenu", line: 1, isForwarded: false }],
      },
    ];

    const result = aggregateParameters(analyses, 3);
    expect(result.length).toBe(1); // Only userId has 4 occurrences (>= 3)

    const userId = result.find((p) => p.name === "userId");
    expect(userId).toBeDefined();
    expect(userId?.occurrences).toBe(4);
    expect(userId?.forwarding_evidence).toBe(3);
    expect(userId?.risk).toBe("high"); // 4 occurrences, 3/4 = 0.75 ratio
    expect(userId?.files).toHaveLength(4);
  });

  it("filters below min_occurrences threshold", () => {
    const analyses: FileParameterAnalysis[] = [
      {
        path: "a.ts",
        language: "typescript",
        parameters: [{ name: "rare", functionName: "fn1", line: 1, isForwarded: true }],
      },
      {
        path: "b.ts",
        language: "typescript",
        parameters: [{ name: "rare", functionName: "fn2", line: 1, isForwarded: true }],
      },
    ];

    const result = aggregateParameters(analyses, 3);
    expect(result.length).toBe(0); // Only 2 occurrences, threshold is 3
  });

  it("assigns low risk for 3 occurrences with no forwarding", () => {
    const analyses: FileParameterAnalysis[] = [
      {
        path: "a.ts",
        language: "typescript",
        parameters: [{ name: "token", functionName: "fn1", line: 1, isForwarded: false }],
      },
      {
        path: "b.ts",
        language: "typescript",
        parameters: [{ name: "token", functionName: "fn2", line: 1, isForwarded: false }],
      },
      {
        path: "c.ts",
        language: "typescript",
        parameters: [{ name: "token", functionName: "fn3", line: 1, isForwarded: false }],
      },
    ];

    const result = aggregateParameters(analyses, 3);
    expect(result.length).toBe(1);
    expect(result[0].risk).toBe("low");
  });
});

describe("aggregateParameters - risk scoring and ordering", () => {
  it("assigns medium risk for 3 occurrences with forwarding evidence", () => {
    const analyses: FileParameterAnalysis[] = [
      {
        path: "a.ts",
        language: "typescript",
        parameters: [{ name: "token", functionName: "fn1", line: 1, isForwarded: true }],
      },
      {
        path: "b.ts",
        language: "typescript",
        parameters: [{ name: "token", functionName: "fn2", line: 1, isForwarded: true }],
      },
      {
        path: "c.ts",
        language: "typescript",
        parameters: [{ name: "token", functionName: "fn3", line: 1, isForwarded: false }],
      },
    ];

    const result = aggregateParameters(analyses, 3);
    expect(result.length).toBe(1);
    expect(result[0].risk).toBe("medium");
  });

  it("sorts by occurrences descending", () => {
    const analyses: FileParameterAnalysis[] = [
      {
        path: "a.ts",
        language: "typescript",
        parameters: [
          { name: "alpha", functionName: "fn1", line: 1, isForwarded: true },
          { name: "beta", functionName: "fn1", line: 1, isForwarded: true },
        ],
      },
      {
        path: "b.ts",
        language: "typescript",
        parameters: [
          { name: "alpha", functionName: "fn2", line: 1, isForwarded: true },
          { name: "beta", functionName: "fn2", line: 1, isForwarded: true },
        ],
      },
      {
        path: "c.ts",
        language: "typescript",
        parameters: [
          { name: "alpha", functionName: "fn3", line: 1, isForwarded: true },
          { name: "beta", functionName: "fn3", line: 1, isForwarded: true },
        ],
      },
      {
        path: "d.ts",
        language: "typescript",
        parameters: [{ name: "beta", functionName: "fn4", line: 1, isForwarded: true }],
      },
    ];

    const result = aggregateParameters(analyses, 3);
    expect(result[0].name).toBe("beta"); // 4 occurrences
    expect(result[1].name).toBe("alpha"); // 3 occurrences
  });

  it("assigns medium risk for 2 occurrences with forwardingRatio > 0.5", () => {
    const analyses: FileParameterAnalysis[] = [
      {
        path: "a.ts",
        language: "typescript",
        parameters: [{ name: "sessionId", functionName: "fn1", line: 1, isForwarded: true }],
      },
      {
        path: "b.ts",
        language: "typescript",
        parameters: [{ name: "sessionId", functionName: "fn2", line: 1, isForwarded: true }],
      },
    ];

    const result = aggregateParameters(analyses, 2);
    expect(result.length).toBe(1);
    // 2 occurrences, 2/2 = 1.0 ratio: too few occurrences for the ">= 3" medium
    // path, but the "occurrences >= 2 && ratio > 0.5" alternative still applies.
    expect(result[0].risk).toBe("medium");
  });
});

describe("analyzeFilesForParameters", () => {
  let dir: string;

  beforeAll(async () => {
    dir = join(tmpdir(), `scopewalker-propdrilling-analysis-test-${String(Date.now())}`);
    await mkdir(dir, { recursive: true });
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("resolves function names declared through a function_declarator node", async () => {
    // C (and C++) wrap the function name in a function_declarator rather than
    // exposing it as a direct identifier child, exercising getFunctionName's
    // second lookup path.
    await writeFile(
      join(dir, "math.c"),
      `int add(int a, int b) {\n  return helper(a, b);\n}\n\nint helper(int a, int b) {\n  return a + b;\n}\n`
    );

    const { fileAnalyses } = await analyzeFilesForParameters(["math.c"], dir, true);

    expect(fileAnalyses).toHaveLength(1);
    const names = fileAnalyses[0]?.parameters.map((p) => p.functionName);
    expect(names).toEqual(["add", "add", "helper", "helper"]);
  });

  it("falls back to <anonymous> when a function has no discoverable name", async () => {
    // An arrow passed straight to a call binds no name anywhere, unlike
    // `const run = (item) => ...`, which takes the name of its declarator.
    await writeFile(
      join(dir, "anon.ts"),
      `register((item: string) => {\n  return process(item);\n});\n`
    );

    const { fileAnalyses } = await analyzeFilesForParameters(["anon.ts"], dir, true);

    expect(fileAnalyses).toHaveLength(1);
    expect(fileAnalyses[0]?.parameters).toEqual([
      { name: "item", functionName: "<anonymous>", line: 1, isForwarded: true },
    ]);
  });

  it("skips a file when the parser returns no tree", async () => {
    await writeFile(
      join(dir, "unparsable.ts"),
      `// NO_TREE\nfunction shouldBeSkipped(x: string) { return x; }\n`
    );
    await writeFile(
      join(dir, "ok.ts"),
      `function processRequest(token: string) { return token; }\n`
    );

    const { fileAnalyses, totalParamsScanned } = await analyzeFilesForParameters(
      ["unparsable.ts", "ok.ts"],
      dir,
      true
    );

    expect(fileAnalyses.map((f) => f.path)).toEqual(["ok.ts"]);
    expect(totalParamsScanned).toBe(1);
  });
});

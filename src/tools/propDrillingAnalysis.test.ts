import { describe, expect, it } from "vitest";
import type { FileParameterAnalysis } from "../types/propDrilling.js";
import { aggregateParameters } from "./propDrillingAnalysis.js";

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

  it("assigns medium risk for 3 occurrences", () => {
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
});

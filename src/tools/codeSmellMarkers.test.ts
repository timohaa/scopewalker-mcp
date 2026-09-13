import { describe, expect, it } from "vitest";
import type { CodeSmellType } from "../types/index.js";
import { detectSmellsInComments } from "./codeSmellMarkers.js";

describe("detectSmellsInComments - text truncation", () => {
  it("truncates comment text longer than the max length", () => {
    const longWord = "a".repeat(250);
    const comments = [{ startLine: 1, endLine: 1, text: `// TODO: ${longWord}` }];

    const smells = detectSmellsInComments(comments, "sample.ts", ["todo"], true);

    expect(smells[0]?.text.endsWith("...")).toBe(true);
    expect(smells[0]?.text.length).toBe(203); // 200 chars + "..."
  });
});

describe("detectSmellsInComments - marker vs. prose (H4)", () => {
  const types: CodeSmellType[] = ["todo", "fixme", "hack", "xxx", "bug", "unused", "deprecated"];

  it("does not flag marker keywords used inside ordinary lowercase prose", () => {
    // repro-go-java/prose.go
    const comments = [
      { startLine: 3, endLine: 3, text: "// This fixes a rounding bug in the unused path." },
    ];

    expect(detectSmellsInComments(comments, "prose.go", types, false)).toEqual([]);
  });

  it("does not flag lowercase or mixed-case marker words anywhere but a marked comment start", () => {
    // findings-ts.md B2 / repro-ts/sm/b.ts
    const comments = [
      { startLine: 1, endLine: 1, text: "// this is a workaround to hack around the limitation" },
      { startLine: 2, endLine: 2, text: "// we do not use the unused variable here" },
      { startLine: 3, endLine: 3, text: "// a todo list component" },
      { startLine: 4, endLine: 4, text: "// avoid the bug that Safari has" },
      { startLine: 5, endLine: 5, text: "// Deprecated APIs are removed in v2" },
    ];

    expect(detectSmellsInComments(comments, "b.ts", types, false)).toEqual([]);
  });

  it("does not flag a CLI-flag-style word inside a comment (--no-xxx)", () => {
    const comments = [{ startLine: 1, endLine: 1, text: "// pass --no-xxx to disable it" }];

    expect(detectSmellsInComments(comments, "flags.ts", types, false)).toEqual([]);
  });

  it("does not flag a placeholder value assignment (#token=xxx)", () => {
    const comments = [{ startLine: 1, endLine: 1, text: "# example: #token=xxx" }];

    expect(detectSmellsInComments(comments, "config.py", types, false)).toEqual([]);
  });

  it("flags uppercase markers followed by a colon, a paren, or a dash", () => {
    const comments = [
      { startLine: 1, endLine: 1, text: "// TODO: refactor this" },
      { startLine: 2, endLine: 2, text: "// TODO(alice): refactor this" },
      { startLine: 3, endLine: 3, text: "// FIXME - handle the edge case" },
    ];

    const smells = detectSmellsInComments(comments, "a.ts", ["todo", "fixme"], false);

    expect(smells).toEqual([
      { path: "a.ts", line: 1, type: "todo", text: "<redacted>" },
      { path: "a.ts", line: 2, type: "todo", text: "<redacted>" },
      { path: "a.ts", line: 3, type: "fixme", text: "<redacted>" },
    ]);
  });

  it("flags the lowercase marker form only at the very start of the comment, followed by a colon", () => {
    const comments = [{ startLine: 1, endLine: 1, text: "// todo: x" }];

    expect(detectSmellsInComments(comments, "a.ts", ["todo"], false)).toEqual([
      { path: "a.ts", line: 1, type: "todo", text: "<redacted>" },
    ]);
  });

  it("does not flag the lowercase marker form when it is not at the very start", () => {
    const comments = [{ startLine: 1, endLine: 1, text: "// please todo: x" }];

    expect(detectSmellsInComments(comments, "a.ts", ["todo"], false)).toEqual([]);
  });

  it("reports the line the marker is actually on, not the comment's start line (L8)", () => {
    const comments = [
      {
        startLine: 10,
        endLine: 13,
        text: "/*\n * some notes\n * TODO: fix this later\n */",
      },
    ];

    const smells = detectSmellsInComments(comments, "a.ts", ["todo"], false);

    expect(smells).toEqual([{ path: "a.ts", line: 12, type: "todo", text: "<redacted>" }]);
  });
});

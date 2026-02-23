import { describe, it, expect } from "vitest";
import { detectLanguage, isLanguageSupported } from "./treeSitter.js";

describe("detectLanguage", () => {
  it("detects TypeScript files", () => {
    expect(detectLanguage("foo.ts")).toBe("typescript");
    expect(detectLanguage("foo.tsx")).toBe("typescript");
  });

  it("detects JavaScript files", () => {
    expect(detectLanguage("foo.js")).toBe("javascript");
    expect(detectLanguage("foo.jsx")).toBe("javascript");
    expect(detectLanguage("foo.mjs")).toBe("javascript");
    expect(detectLanguage("foo.cjs")).toBe("javascript");
  });

  it("detects Python files", () => {
    expect(detectLanguage("foo.py")).toBe("python");
  });

  it("detects Go files", () => {
    expect(detectLanguage("foo.go")).toBe("go");
  });

  it("detects Rust files", () => {
    expect(detectLanguage("foo.rs")).toBe("rust");
  });

  it("detects Java files", () => {
    expect(detectLanguage("foo.java")).toBe("java");
  });

  it("detects C files", () => {
    expect(detectLanguage("foo.c")).toBe("c");
    expect(detectLanguage("foo.h")).toBe("c");
  });

  it("detects C++ files", () => {
    expect(detectLanguage("foo.cpp")).toBe("cpp");
    expect(detectLanguage("foo.cc")).toBe("cpp");
    expect(detectLanguage("foo.hpp")).toBe("cpp");
  });

  it("detects Ruby files", () => {
    expect(detectLanguage("foo.rb")).toBe("ruby");
  });

  it("returns null for unknown extensions", () => {
    expect(detectLanguage("foo.xyz")).toBeNull();
    expect(detectLanguage("foo.md")).toBeNull();
    expect(detectLanguage("foo.json")).toBeNull();
  });
});

describe("isLanguageSupported", () => {
  it("returns true for supported languages", () => {
    expect(isLanguageSupported("typescript")).toBe(true);
    expect(isLanguageSupported("javascript")).toBe(true);
    expect(isLanguageSupported("python")).toBe(true);
  });

  it("returns false for unsupported languages", () => {
    expect(isLanguageSupported("haskell")).toBe(false);
    expect(isLanguageSupported("")).toBe(false);
  });
});

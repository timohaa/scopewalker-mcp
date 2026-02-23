import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { DocumentationCoverageResult } from "../types/index.js";
import { registerDocumentationCoverageTool } from "./documentationCoverage.js";

describe("documentationCoverage tool - C headers", () => {
  let testDir: string;
  const handler = getToolHandler(registerDocumentationCoverageTool, "get_documentation_coverage");

  beforeAll(async () => {
    testDir = join(tmpdir(), `scopewalker-doc-c-test-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });

    // C header file with JSDoc-style documentation
    await writeFile(
      join(testDir, "sample.h"),
      `/**
 * @file sample.h
 * @brief Sample header for testing
 */

#ifndef SAMPLE_H
#define SAMPLE_H

/**
 * Creates a new example.
 *
 * @param width  Width parameter
 * @param height Height parameter
 * @return       Pointer to example, or NULL on failure
 */
void *example_create(int width, int height);

/**
 * Destroys an example.
 *
 * @param ex Example to destroy (can be NULL)
 */
void example_destroy(void *ex);

// Regular comment, not a doc comment
void undocumented_func(void);

#endif // SAMPLE_H
`
    );

    // C header without documentation
    await writeFile(
      join(testDir, "nodocs.h"),
      `#ifndef NODOCS_H
#define NODOCS_H

int no_doc_func(int x);

void another_undoc(void);

#endif
`
    );
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("detects JSDoc documentation in C header files", async () => {
    const response = await handler({ path: testDir, extensions: [".h"] });
    const result = parseContent<DocumentationCoverageResult>(response);

    // example_create and example_destroy are documented, undocumented_func is not
    expect(result.coverage.documented).toBe(2);
    expect(result.coverage.undocumented).toBe(3); // undocumented_func + no_doc_func + another_undoc

    const sampleH = result.by_file.find((file) => file.path.endsWith("sample.h"));
    expect(sampleH?.documented).toBe(2);
    expect(sampleH?.undocumented).toBe(1);

    const nodocsH = result.by_file.find((file) => file.path.endsWith("nodocs.h"));
    expect(nodocsH?.documented).toBe(0);
    expect(nodocsH?.undocumented).toBe(2);
  });
});

describe("documentationCoverage tool - Python", () => {
  let testDir: string;
  const handler = getToolHandler(registerDocumentationCoverageTool, "get_documentation_coverage");

  beforeAll(async () => {
    testDir = join(tmpdir(), `scopewalker-doc-py-test-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });

    await writeFile(
      join(testDir, "sample.py"),
      `"""Module docstring."""

def documented_func(name: str) -> str:
    """Returns a greeting."""
    return f"Hello, {name}"

def undocumented_func(x: int) -> int:
    return x * 2

class DocumentedClass:
    """A documented class."""

    def documented_method(self) -> None:
        """Does something."""
        pass

    def undocumented_method(self) -> None:
        pass
`
    );
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("detects Python docstrings", async () => {
    const response = await handler({ path: testDir });
    const result = parseContent<DocumentationCoverageResult>(response);

    expect(result.coverage.documented).toBe(3); // documented_func, DocumentedClass, documented_method
    expect(result.coverage.undocumented).toBe(2); // undocumented_func, undocumented_method
  });
});

describe("documentationCoverage tool - Rust", () => {
  let testDir: string;
  const handler = getToolHandler(registerDocumentationCoverageTool, "get_documentation_coverage");

  beforeAll(async () => {
    testDir = join(tmpdir(), `scopewalker-doc-rs-test-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });

    await writeFile(
      join(testDir, "sample.rs"),
      `/// A documented function.
fn documented_fn() -> i32 {
    42
}

fn undocumented_fn() -> i32 {
    0
}

/// A documented struct.
struct DocumentedStruct {
    value: i32,
}
`
    );
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("detects Rust doc comments", async () => {
    const response = await handler({ path: testDir });
    const result = parseContent<DocumentationCoverageResult>(response);

    expect(result.coverage.documented).toBeGreaterThanOrEqual(1);
    expect(result.coverage.undocumented).toBeGreaterThanOrEqual(1);
  });
});

describe("documentationCoverage tool - Go", () => {
  let testDir: string;
  const handler = getToolHandler(registerDocumentationCoverageTool, "get_documentation_coverage");

  beforeAll(async () => {
    testDir = join(tmpdir(), `scopewalker-doc-go-test-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });

    await writeFile(
      join(testDir, "sample.go"),
      `package sample

// DocumentedFunc is a documented function.
func DocumentedFunc() int {
	return 42
}

func undocumentedFunc() int {
	return 0
}

// Calculator provides calculation methods.
type Calculator struct {
	value int
}
`
    );
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("detects Go comments as documentation", async () => {
    const response = await handler({ path: testDir });
    const result = parseContent<DocumentationCoverageResult>(response);

    expect(result.coverage.documented).toBeGreaterThanOrEqual(1);
    expect(result.coverage.undocumented).toBeGreaterThanOrEqual(1);
  });
});

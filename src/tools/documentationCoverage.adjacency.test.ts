import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { DocumentationCoverageResult } from "../types/index.js";
import { registerDocumentationCoverageTool } from "./documentationCoverage.js";

/**
 * A comment documents a declaration only when it ends on the line directly above
 * it. Field testing found the tool crediting a remark about the previous
 * declaration to the next one whenever blank lines sat between them.
 */
describe("documentationCoverage - comment adjacency (blank line gaps)", () => {
  let testDir: string;
  const handler = getToolHandler(registerDocumentationCoverageTool, "get_documentation_coverage");

  /** Writes one fixture and returns the names the tool reports as undocumented. */
  async function undocumentedIn(fileName: string, source: string): Promise<string[]> {
    const path = join(testDir, fileName);
    await writeFile(path, source);
    const response = await handler({ path });
    const result = parseContent<DocumentationCoverageResult>(response);
    return result.undocumented_items.map((item) => item.name);
  }

  beforeAll(async () => {
    testDir = join(tmpdir(), `scopewalker-doc-adjacency-blank-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("does not credit a Go comment separated by blank lines to the next function", async () => {
    const names = await undocumentedIn(
      "blank.go",
      `package main

// Foo does the first thing.
func Foo() int {
	return 1
}

// end of Foo's helper notes, unrelated to what follows


func Bar() int {
	return 2
}
`
    );

    expect(names).toContain("Bar");
    expect(names).not.toContain("Foo");
  });

  it("does not credit a Javadoc block separated by blank lines to the next method", async () => {
    const names = await undocumentedIn(
      "FalseDoc.java",
      `public class FalseDoc {
    /**
     * Foo does the first thing.
     */
    public int foo() {
        return 1;
    }

    /**
     * Trailing note about foo, not about bar.
     */


    public int bar() {
        return 2;
    }
}
`
    );

    expect(names).toContain("bar");
    expect(names).not.toContain("foo");
  });

  it("does not credit a Ruby comment separated by a blank line to the next def", async () => {
    const names = await undocumentedIn(
      "blank_line_comment.rb",
      `class Foo
  # This comment is separated from the method below by a blank line

  def detached
    1
  end
end
`
    );

    expect(names).toContain("detached");
  });
});

describe("documentationCoverage - comment adjacency (trailing/attribution)", () => {
  let testDir: string;
  const handler = getToolHandler(registerDocumentationCoverageTool, "get_documentation_coverage");

  /** Writes one fixture and returns the names the tool reports as undocumented. */
  async function undocumentedIn(fileName: string, source: string): Promise<string[]> {
    const path = join(testDir, fileName);
    await writeFile(path, source);
    const response = await handler({ path });
    const result = parseContent<DocumentationCoverageResult>(response);
    return result.undocumented_items.map((item) => item.name);
  }

  beforeAll(async () => {
    testDir = join(tmpdir(), `scopewalker-doc-adjacency-trailing-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("does not credit a JSDoc block separated by a blank line to the next function", async () => {
    const names = await undocumentedIn(
      "blank.ts",
      `/** Adds two numbers. */
export function add(a: number, b: number): number {
  return a + b;
}

/** Trailing note about add. */

export function subtract(a: number, b: number): number {
  return a - b;
}
`
    );

    expect(names).toContain("subtract");
    expect(names).not.toContain("add");
  });

  it("does not credit a trailing comment on the previous declaration's last line", async () => {
    const names = await undocumentedIn(
      "trailing.go",
      `package main

// Foo does the first thing.
func Foo() int {
	return 1
} // end Foo

func Bar() int {
	return 2
}
`
    );

    expect(names).toContain("Bar");
    expect(names).not.toContain("Foo");
  });

  it("does not credit a doc comment separated by another declaration", async () => {
    const names = await undocumentedIn(
      "between.ts",
      `/** Documents only the first one. */
export function first(): void {}
export function second(): void {}
`
    );

    expect(names).toEqual(["second"]);
  });
});

/** Decorators and attributes belong to the declaration, not to the gap above it. */
describe("documentationCoverage - comment blocks and decorators", () => {
  let testDir: string;
  const handler = getToolHandler(registerDocumentationCoverageTool, "get_documentation_coverage");

  /** Writes one fixture and returns the names the tool reports as undocumented. */
  async function undocumentedIn(fileName: string, source: string): Promise<string[]> {
    const path = join(testDir, fileName);
    await writeFile(path, source);
    const response = await handler({ path });
    const result = parseContent<DocumentationCoverageResult>(response);
    return result.undocumented_items.map((item) => item.name);
  }

  beforeAll(async () => {
    testDir = join(tmpdir(), `scopewalker-doc-decorators-${String(Date.now())}`);
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("reads stacked comment lines directly above as one doc block", async () => {
    const names = await undocumentedIn(
      "stacked.ts",
      `// eslint-disable-next-line no-console
/** Logs it. */
// eslint-disable-next-line no-console
export function log(x: string): void {
  console.log(x);
}
`
    );

    expect(names).toEqual([]);
  });

  it("looks past a multi-line decorator between the doc comment and the class", async () => {
    const names = await undocumentedIn(
      "decorated.ts",
      `/** A documented service. */
@Injectable({
  providedIn: "root",
})
export class Service {
  /** Runs it. */
  @Log()
  run(): void {}
}
`
    );

    expect(names).toEqual([]);
  });

  it("looks past a Python decorator between the docstring-free comment and the def", async () => {
    const names = await undocumentedIn(
      "deco.py",
      `class Holder:
    """Holds things."""

    @staticmethod
    def documented():
        """Does something."""
        return 1

    @staticmethod
    def undocumented():
        return 2
`
    );

    expect(names).toEqual(["undocumented"]);
  });
});

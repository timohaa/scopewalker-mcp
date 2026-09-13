import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { DocumentationCoverageResult } from "../types/index.js";
import { registerDocumentationCoverageTool } from "./documentationCoverage.js";

describe("documentationCoverage - Rust doc comment forms", () => {
  let rustDir: string;
  const handler = getToolHandler(registerDocumentationCoverageTool, "get_documentation_coverage");

  beforeAll(async () => {
    rustDir = join(tmpdir(), `scopewalker-doc-rust-forms-${String(Date.now())}`);
    await mkdir(rustDir, { recursive: true });

    await writeFile(
      join(rustDir, "forms.rs"),
      `/// Docs then attribute.
#[inline]
pub fn with_attr() {}

/** Block doc comment. */
pub fn block_doc() {}

#[doc = "Attribute doc."]
pub fn attr_doc() {}

/* Not a doc comment. */
pub fn plain_block() {}

/// Docs, blank line, then fn.

pub fn after_blank() {}
`
    );

    await writeFile(
      join(rustDir, "inner.rs"),
      `mod helpers {
    //! Helper routines.
    pub fn undocumented_helper() {}
}
`
    );
  });

  afterAll(async () => {
    await rm(rustDir, { recursive: true, force: true });
  });

  it("accepts ///, /** */ and #[doc] but not a plain block comment or a detached doc", async () => {
    const response = await handler({ path: join(rustDir, "forms.rs") });
    const result = parseContent<DocumentationCoverageResult>(response);

    const names = result.undocumented_items.map((item) => item.name);
    expect(names).toEqual(["plain_block", "after_blank"]);
  });

  // `//!` documents the module it sits in, so it can never document the item below it.
  it("never credits a //! inner doc comment to the following item", async () => {
    const response = await handler({ path: join(rustDir, "inner.rs") });
    const result = parseContent<DocumentationCoverageResult>(response);

    expect(result.undocumented_items.map((item) => item.name)).toEqual(["undocumented_helper"]);
  });
});

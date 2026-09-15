import { describe, it, expect } from "vitest";
import { countImports } from "./treeSitterImports.js";

describe("countImports", () => {
  it("counts each Java import declaration once", async () => {
    const code = `import java.util.List;
import java.util.*;
import static java.util.Collections.emptyList;

class Example {}`;

    expect(await countImports(code, "java")).toBe(3);
  });

  it("counts individual Go imports in a grouped declaration", async () => {
    const code = `package main

import (
    "fmt"
    "os"
)`;

    expect(await countImports(code, "go")).toBe(2);
  });

  it("counts Go imports in single-line declarations", async () => {
    const code = `package main

import "fmt"
import "os"`;

    expect(await countImports(code, "go")).toBe(2);
  });
});

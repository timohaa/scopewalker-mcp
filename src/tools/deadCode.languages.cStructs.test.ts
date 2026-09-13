import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { DeadCodeItem, DeadCodeResult } from "../types/index.js";
import { registerDeadCodeTool } from "./deadCode.js";

const handler = getToolHandler(registerDeadCodeTool, "find_dead_code");

async function findingsOf(path: string): Promise<DeadCodeItem[]> {
  const response = await handler({ path, limit: 100 });
  const result = parseContent<DeadCodeResult>(response);
  return [...result.dead_code, ...result.unreferenced_exports];
}

describe("find_dead_code - C tag references and pointer returns", () => {
  let dir: string;

  beforeAll(async () => {
    dir = join(tmpdir(), `scopewalker-dead-cstructs-c-${String(Date.now())}`);
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, "shapes.c"),
      `struct Point {
  int x;
  int y;
};

struct Line {
  struct Point start;
  struct Point end;
};

struct Line *make_line(void) {
  return 0;
}

int main(void) {
  struct Line *l = make_line();
  return l->start.x;
}
`
    );

    await writeFile(
      join(dir, "renderer.c"),
      `SDL_Window *renderer_get_window(void) {
  return 0;
}

void renderer_run(void) {
  renderer_get_window();
}
`
    );

    await writeFile(
      join(dir, "factory.c"),
      `static struct Foo *make_hidden(void) {
  return 0;
}

struct Foo *make_public(void) {
  return 0;
}
`
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("does not report a struct used as a field type", async () => {
    const findings = await findingsOf(join(dir, "shapes.c"));
    expect(findings.some((item) => item.name === "Point")).toBe(false);
    expect(findings.some((item) => item.name === "Line")).toBe(false);
  });

  it("does not report a struct-returning function that is called", async () => {
    const findings = await findingsOf(join(dir, "shapes.c"));
    expect(findings.some((item) => item.name === "make_line")).toBe(false);
  });

  it("never reports a type that the file only uses", async () => {
    const findings = await findingsOf(join(dir, "renderer.c"));
    expect(findings.some((item) => item.name === "SDL_Window")).toBe(false);
    expect(findings.some((item) => item.name === "renderer_get_window")).toBe(false);
  });

  it("reports an unused pointer-returning function in the bucket its scope names", async () => {
    const response = await handler({ path: join(dir, "factory.c"), limit: 100 });
    const result = parseContent<DeadCodeResult>(response);

    expect(result.dead_code).toContainEqual(
      expect.objectContaining({ name: "make_hidden", type: "function" })
    );
    expect(result.unreferenced_exports).toContainEqual(
      expect.objectContaining({ name: "make_public", type: "function" })
    );
  });
});

describe("find_dead_code - C++ tag references and pointer returns", () => {
  let dir: string;

  beforeAll(async () => {
    dir = join(tmpdir(), `scopewalker-dead-cstructs-cpp-${String(Date.now())}`);
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, "boxes.cpp"),
      `struct Point {
  int x;
  int y;
};

class Line {
  struct Point start;
  struct Point end;
};

Line *makeLine() {
  return 0;
}

int useLine() {
  Line *l = makeLine();
  return 0;
}
`
    );

    await writeFile(
      join(dir, "widget.hpp"),
      `class Widget {
private:
  int *hidden();
};
`
    );

    await writeFile(
      join(dir, "widget.cpp"),
      `int *Widget::hidden() {
  return 0;
}
`
    );

    await writeFile(
      join(dir, "palette.c"),
      `struct Config {
  enum Color tint;
  union Pixel px;
};

void paint(struct Config *c) {}
`
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("does not report a C++ struct used as a field type in a class", async () => {
    const findings = await findingsOf(join(dir, "boxes.cpp"));
    expect(findings.some((item) => item.name === "Point")).toBe(false);
    expect(findings.some((item) => item.name === "makeLine")).toBe(false);
  });

  it("keeps a pointer-returning out-of-line definition out of the candidates", async () => {
    const findings = await findingsOf(dir);
    expect(findings.some((item) => item.name.includes("::"))).toBe(false);
    expect(findings.some((item) => item.name === "hidden")).toBe(false);
  });

  it("does not report an enum or union named only as a field type", async () => {
    const findings = await findingsOf(join(dir, "palette.c"));
    expect(findings.some((item) => item.name === "Color")).toBe(false);
    expect(findings.some((item) => item.name === "Pixel")).toBe(false);
  });
});

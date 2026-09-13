import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { DeadCodeResult } from "../types/index.js";
import { registerDeadCodeTool } from "./deadCode.js";

const handler = getToolHandler(registerDeadCodeTool, "find_dead_code");

let dir: string;

beforeAll(async () => {
  dir = join(tmpdir(), `scopewalker-dead-cpp-${String(Date.now())}`);
  await mkdir(dir, { recursive: true });

  await writeFile(
    join(dir, "math.c"),
    `static int helperUnused(int x) {
    return x;
}

int publicUnused(int x) {
    return x;
}

int main(void) {
    return 0;
}
`
  );

  await writeFile(
    join(dir, "widget.cpp"),
    `class Widget {
private:
  void resize() {}
};

void Widget::resize() {}
`
  );

  await writeFile(
    join(dir, "account.cpp"),
    `class Account {
private:
  void secretUnused() {}
};
`
  );

  await writeFile(
    join(dir, "header.h"),
    `static int staticInHeader(int x) {
    return x;
}
`
  );

  await writeFile(
    join(dir, "widgetHeader.hpp"),
    `class WidgetHeader {
private:
  void hiddenInHeader() {}
};
`
  );
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("find_dead_code - C/C++", () => {
  it("marks a static C function as dead_code", async () => {
    const response = await handler({ path: join(dir, "math.c"), limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    expect(result.dead_code.some((item) => item.name === "helperUnused")).toBe(true);
  });

  it("marks a non-static C function as unreferenced_exports", async () => {
    const response = await handler({ path: join(dir, "math.c"), limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    expect(result.unreferenced_exports.some((item) => item.name === "publicUnused")).toBe(true);
  });

  it("excludes main", async () => {
    const response = await handler({ path: join(dir, "math.c"), limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    const findings = [...result.dead_code, ...result.unreferenced_exports];
    expect(findings.some((item) => item.name === "main")).toBe(false);
  });

  it("drops a C++ out-of-line definition as a candidate", async () => {
    const response = await handler({ path: join(dir, "widget.cpp"), limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    const findings = [...result.dead_code, ...result.unreferenced_exports];
    expect(findings.some((item) => item.name.includes("::"))).toBe(false);
  });

  it("marks a private in-class method in a .cpp file as dead_code on a single-file scan", async () => {
    const response = await handler({ path: join(dir, "account.cpp"), limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    expect(result.dead_code).toContainEqual(
      expect.objectContaining({ name: "secretUnused", type: "method" })
    );
  });

  it("marks a static function declared in a header as unreferenced_exports", async () => {
    const response = await handler({ path: join(dir, "header.h"), limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    expect(result.dead_code.some((item) => item.name === "staticInHeader")).toBe(false);
    expect(result.unreferenced_exports.some((item) => item.name === "staticInHeader")).toBe(true);
  });

  it("marks a private in-class method declared in a header as unreferenced_exports", async () => {
    const response = await handler({ path: join(dir, "widgetHeader.hpp"), limit: 100 });
    const result = parseContent<DeadCodeResult>(response);
    expect(result.dead_code.some((item) => item.name === "hiddenInHeader")).toBe(false);
    expect(result.unreferenced_exports).toContainEqual(
      expect.objectContaining({ name: "hiddenInHeader", type: "method" })
    );
  });
});

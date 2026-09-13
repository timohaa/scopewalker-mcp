import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { DeadCodeItem, DeadCodeResult } from "../types/index.js";
import { registerDeadCodeTool } from "./deadCode.js";

const handler = getToolHandler(registerDeadCodeTool, "find_dead_code");

/** Runs the tool over a single file and returns both lists concatenated. */
async function findingsOf(path: string): Promise<DeadCodeItem[]> {
  const response = await handler({ path, limit: 100 });
  const result = parseContent<DeadCodeResult>(response);
  return [...result.dead_code, ...result.unreferenced_exports];
}

/**
 * A name spelled only inside a string is exactly the kind of reflection Python,
 * Ruby, Java and JS all support, so the tool must count it rather than raise a
 * false alarm on the declaration it names.
 */
describe("find_dead_code - string-based reference guards", () => {
  let dir: string;

  beforeAll(async () => {
    dir = join(tmpdir(), `scopewalker-dead-strrefs-${String(Date.now())}`);
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, "getattr.py"),
      `def helper():
    return 1


getattr(obj, "helper")
`
    );

    await writeFile(
      join(dir, "send.rb"),
      `def target
  1
end

obj.send(:target)
`
    );

    await writeFile(
      join(dir, "bracket.ts"),
      `function target() {
  return 1;
}

obj["target"];
`
    );

    await writeFile(
      join(dir, "dunderAll.py"),
      `def target():
    return 1


__all__ = ["target"]
`
    );

    await writeFile(
      join(dir, "Reflect.java"),
      `class Widget {}

class Loader {
  void load() {
    Class.forName("Widget");
  }
}
`
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('counts a Python getattr(o, "name") string as a reference', async () => {
    const findings = await findingsOf(join(dir, "getattr.py"));
    expect(findings.some((item) => item.name === "helper")).toBe(false);
  });

  it("counts a Ruby send(:name) symbol as a reference", async () => {
    const findings = await findingsOf(join(dir, "send.rb"));
    expect(findings.some((item) => item.name === "target")).toBe(false);
  });

  it('counts a JS obj["name"] bracket access as a reference', async () => {
    const findings = await findingsOf(join(dir, "bracket.ts"));
    expect(findings.some((item) => item.name === "target")).toBe(false);
  });

  it("counts a Python __all__ string entry as a reference", async () => {
    const findings = await findingsOf(join(dir, "dunderAll.py"));
    expect(findings.some((item) => item.name === "target")).toBe(false);
  });

  it('counts a Java Class.forName("Name") string as a reference', async () => {
    const findings = await findingsOf(join(dir, "Reflect.java"));
    expect(findings.some((item) => item.name === "Widget")).toBe(false);
  });
});

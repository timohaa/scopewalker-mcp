import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { CodeInventoryResult, MethodVisibility } from "../types/index.js";
import { registerCodeInventoryTool } from "./codeInventory.js";

const handler = getToolHandler(registerCodeInventoryTool, "get_code_inventory");

/** Maps a class's methods to name → visibility, the shape every assertion here needs. */
async function visibilityOf(
  path: string,
  className: string,
  includePrivate = true
): Promise<Map<string, MethodVisibility>> {
  const response = await handler({ path, include_private: includePrivate });
  const result = parseContent<CodeInventoryResult>(response);
  const target = result.inventory
    .flatMap((file) => file.items)
    .find((item) => item.name === className);

  return new Map((target?.methods ?? []).map((method) => [method.name, method.visibility]));
}

describe("codeInventory tool - Java visibility", () => {
  let dir: string;

  beforeAll(async () => {
    dir = join(tmpdir(), `scopewalker-inv-vis-java-${String(Date.now())}`);
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, "Acct.java"),
      `public class Acct {
  public void open() {}
  private void secret() {}
  protected void mid() {}
  void pkg() {}
}
`
    );
    await writeFile(
      join(dir, "Hidden.java"),
      `class Hidden {
  public void reachable() {}
}
`
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads the access modifier off each method", async () => {
    const visibility = await visibilityOf(join(dir, "Acct.java"), "Acct");

    expect(visibility.get("open")).toBe("public");
    expect(visibility.get("secret")).toBe("private");
    expect(visibility.get("mid")).toBe("protected");
  });

  it("treats an absent modifier as package-private", async () => {
    const visibility = await visibilityOf(join(dir, "Acct.java"), "Acct");

    // Java's default access stops at the package boundary, so it is not part of
    // the type's outside-facing API.
    expect(visibility.get("pkg")).toBe("private");
  });

  it("keeps protected methods in the default view but drops private ones", async () => {
    const visibility = await visibilityOf(join(dir, "Acct.java"), "Acct", false);

    expect([...visibility.keys()].sort()).toEqual(["mid", "open"]);
  });

  it("marks a public class as exported", async () => {
    const response = await handler({ path: join(dir, "Acct.java") });
    const result = parseContent<CodeInventoryResult>(response);

    expect(result.inventory[0].items.find((i) => i.name === "Acct")?.exported).toBe(true);
    expect(result.summary.exported_symbols).toBe(1);
  });

  it("does not mark a package-private class as exported", async () => {
    const response = await handler({ path: join(dir, "Hidden.java"), include_private: true });
    const result = parseContent<CodeInventoryResult>(response);

    expect(result.inventory[0].items.find((i) => i.name === "Hidden")?.exported).toBe(false);
  });
});

describe("codeInventory tool - C++ visibility", () => {
  let dir: string;

  beforeAll(async () => {
    dir = join(tmpdir(), `scopewalker-inv-vis-cpp-${String(Date.now())}`);
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, "acct.cpp"),
      `class Acct {
  void implicitlyPrivate() {}
public:
  void open() {}
private:
  void secret() {}
protected:
  void mid() {}
};

struct Bag {
  void openByDefault() {}
private:
  void hidden() {}
};
`
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("applies each access label to the members that follow it", async () => {
    const visibility = await visibilityOf(join(dir, "acct.cpp"), "Acct");

    expect(visibility.get("open")).toBe("public");
    expect(visibility.get("secret")).toBe("private");
    expect(visibility.get("mid")).toBe("protected");
  });

  it("defaults class members to private before the first label", async () => {
    const visibility = await visibilityOf(join(dir, "acct.cpp"), "Acct");

    expect(visibility.get("implicitlyPrivate")).toBe("private");
  });

  it("defaults struct members to public", async () => {
    const visibility = await visibilityOf(join(dir, "acct.cpp"), "Bag");

    expect(visibility.get("openByDefault")).toBe("public");
    expect(visibility.get("hidden")).toBe("private");
  });
});

describe("codeInventory tool - Ruby visibility", () => {
  let dir: string;

  beforeAll(async () => {
    dir = join(tmpdir(), `scopewalker-inv-vis-rb-${String(Date.now())}`);
    await mkdir(dir, { recursive: true });

    await writeFile(
      join(dir, "acct.rb"),
      `class Acct
  def open
  end

  private

  def secret
  end

  def also_secret
  end

  public

  def open_again
  end
end
`
    );
    await writeFile(
      join(dir, "marked.rb"),
      `class Marked
  def a
  end

  def b
  end

  private :a
  protected :b

  private def inline
  end

  private_class_method def self.class_level
  end
end
`
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("applies a bare private to every method after it", async () => {
    const visibility = await visibilityOf(join(dir, "acct.rb"), "Acct");

    expect(visibility.get("open")).toBe("public");
    expect(visibility.get("secret")).toBe("private");
    expect(visibility.get("also_secret")).toBe("private");
  });

  it("lets a later public reopen the section", async () => {
    const visibility = await visibilityOf(join(dir, "acct.rb"), "Acct");

    expect(visibility.get("open_again")).toBe("public");
  });

  it("applies private :sym to a method defined earlier", async () => {
    const visibility = await visibilityOf(join(dir, "marked.rb"), "Marked");

    expect(visibility.get("a")).toBe("private");
    expect(visibility.get("b")).toBe("protected");
  });

  it("finds methods defined inline as a visibility-call argument", async () => {
    const visibility = await visibilityOf(join(dir, "marked.rb"), "Marked");

    // `private def x` nests the method inside the call's argument_list, so it is
    // not a sibling of the other definitions.
    expect(visibility.get("inline")).toBe("private");
    expect(visibility.get("class_level")).toBe("private");
  });

  it("drops private methods from the default view", async () => {
    const visibility = await visibilityOf(join(dir, "acct.rb"), "Acct", false);

    expect([...visibility.keys()].sort()).toEqual(["open", "open_again"]);
  });
});

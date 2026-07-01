import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getToolHandler, parseContent } from "../testUtils/toolTestHarness.js";
import type { ComplexityMetricsResult } from "../types/index.js";
import { registerComplexityMetricsTool } from "./complexityMetrics.js";

let testDir: string;
const handler = getToolHandler(registerComplexityMetricsTool, "get_complexity_metrics");

beforeAll(async () => {
  testDir = join(tmpdir(), `scopewalker-jsx-test-${String(Date.now())}`);
  await mkdir(testDir, { recursive: true });
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("complexityMetrics JSX props - detection thresholds", () => {
  it("reports jsx_props hotspot for PascalCase component with >5 props", async () => {
    await writeFile(
      join(testDir, "manyProps.tsx"),
      `export function App() {
  return (
    <MyComponent
      name="John"
      age={30}
      email="john@example.com"
      onClick={handler}
      isActive={true}
      role="admin"
    />
  );
}
`
    );

    const response = await handler({ path: join(testDir, "manyProps.tsx") });
    const result = parseContent<ComplexityMetricsResult>(response);

    const hotspots = result.files[0]?.hotspots.filter((h) => h.issue === "jsx_props") ?? [];
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0].function).toBe("MyComponent");
    expect(hotspots[0].value).toBe(6);
    expect(hotspots[0].recommendation).toContain("grouping props");
  });

  it("does not report hotspot for PascalCase component with <=5 props", async () => {
    await writeFile(
      join(testDir, "fewProps.tsx"),
      `export function App() {
  return <MyComponent name="John" age={30} />;
}
`
    );

    const response = await handler({ path: join(testDir, "fewProps.tsx") });
    const result = parseContent<ComplexityMetricsResult>(response);

    const hotspots = result.files[0]?.hotspots.filter((h) => h.issue === "jsx_props") ?? [];
    expect(hotspots).toHaveLength(0);
  });

  it("does not report hotspot for HTML elements with many attributes", async () => {
    await writeFile(
      join(testDir, "htmlAttrs.tsx"),
      `export function App() {
  return (
    <div
      id="main"
      className="container"
      style={{ color: "red" }}
      onClick={handler}
      onMouseEnter={enter}
      onMouseLeave={leave}
      data-testid="main"
    />
  );
}
`
    );

    const response = await handler({ path: join(testDir, "htmlAttrs.tsx") });
    const result = parseContent<ComplexityMetricsResult>(response);

    const hotspots = result.files[0]?.hotspots.filter((h) => h.issue === "jsx_props") ?? [];
    expect(hotspots).toHaveLength(0);
  });
});

describe("complexityMetrics JSX props - metrics integration", () => {
  it("includes JSX props in max_parameters and avg_parameters metrics", async () => {
    await writeFile(
      join(testDir, "propsMetrics.tsx"),
      `export function App() {
  return (
    <Widget a={1} b={2} c={3} d={4} e={5} f={6} g={7} h={8} />
  );
}
`
    );

    const response = await handler({ path: join(testDir, "propsMetrics.tsx") });
    const result = parseContent<ComplexityMetricsResult>(response);

    // Widget has 8 props, App function has 0 params => max should be 8
    expect(result.files[0]?.metrics.max_parameters).toBe(8);
  });

  it("counts props on both self-closing and opening elements", async () => {
    await writeFile(
      join(testDir, "bothTypes.tsx"),
      `export function App() {
  return (
    <div>
      <SelfClosing a={1} b={2} c={3} d={4} e={5} f={6} />
      <Opening a={1} b={2} c={3} d={4} e={5} f={6} g={7}>
        <span>child</span>
      </Opening>
    </div>
  );
}
`
    );

    const response = await handler({ path: join(testDir, "bothTypes.tsx") });
    const result = parseContent<ComplexityMetricsResult>(response);

    const hotspots = result.files[0]?.hotspots.filter((h) => h.issue === "jsx_props") ?? [];
    expect(hotspots).toHaveLength(2);

    const selfClosing = hotspots.find((h) => h.function === "SelfClosing");
    const opening = hotspots.find((h) => h.function === "Opening");
    expect(selfClosing?.value).toBe(6);
    expect(opening?.value).toBe(7);
  });

  it("reports both function parameter and jsx_props hotspots in mixed file", async () => {
    await writeFile(
      join(testDir, "mixed.tsx"),
      `export function manyParams(a: string, b: string, c: number, d: number, e: boolean, f: boolean): void {
  console.log(a, b, c, d, e, f);
}

export function App() {
  return <BigForm a={1} b={2} c={3} d={4} e={5} f={6} g={7} h={8} />;
}
`
    );

    const response = await handler({ path: join(testDir, "mixed.tsx") });
    const result = parseContent<ComplexityMetricsResult>(response);

    const paramHotspots = result.files[0]?.hotspots.filter((h) => h.issue === "parameters") ?? [];
    const jsxHotspots = result.files[0]?.hotspots.filter((h) => h.issue === "jsx_props") ?? [];
    expect(paramHotspots.length).toBeGreaterThanOrEqual(1);
    expect(jsxHotspots.length).toBeGreaterThanOrEqual(1);
  });
});

describe("complexityMetrics JSX props - additional patterns", () => {
  it("counts spread props in addition to regular props", async () => {
    await writeFile(
      join(testDir, "spreadProps.tsx"),
      `export function App() {
  return <MyComponent a={1} b={2} c={3} d={4} e={5} {...extra} />;
}
`
    );

    const response = await handler({ path: join(testDir, "spreadProps.tsx") });
    const result = parseContent<ComplexityMetricsResult>(response);

    const hotspots = result.files[0]?.hotspots.filter((h) => h.issue === "jsx_props") ?? [];
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0].value).toBe(6); // 5 attributes + 1 spread
  });

  it("counts props on Namespace.Component (member_expression)", async () => {
    await writeFile(
      join(testDir, "namespaced.tsx"),
      `export function App() {
  return (
    <Form.Field
      name="email"
      label="Email"
      validate={validator}
      required={true}
      placeholder="Enter email"
      autoComplete="email"
    />
  );
}
`
    );

    const response = await handler({ path: join(testDir, "namespaced.tsx") });
    const result = parseContent<ComplexityMetricsResult>(response);

    const hotspots = result.files[0]?.hotspots.filter((h) => h.issue === "jsx_props") ?? [];
    expect(hotspots).toHaveLength(1);
    expect(hotspots[0].function).toBe("Form.Field");
    expect(hotspots[0].value).toBe(6);
  });
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      // Without `include`, V8 only instruments files a test imports, so an
      // untested module drops out of the denominator instead of counting as
      // zero — that is how src/index.ts stayed invisible at 0%.
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/types/**", // type-only declarations, no runtime code
        "src/testUtils/**", // test harness, not production code
        "src/__fixtures__/**", // sample inputs consumed by tests
      ],
      thresholds: {
        statements: 94.5,
        branches: 88.5,
        functions: 98,
        lines: 96.5,
      },
    },
  },
});

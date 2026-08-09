import { readFile } from "node:fs/promises";
import { describe, it, expect, beforeAll } from "vitest";
import { DECISION_TYPES, CONDITIONAL_ARM_TYPES } from "./complexityMetricsCyclomatic.js";
import { CONTROL_FLOW_TYPES, NESTING_TYPES } from "./complexityMetricsHelpers.js";

// Every grammar ships the full list of node names it can emit. Intersecting our
// decision list against them turns "this name was renamed upstream" from a silent
// zero score into a failing test — the failure mode known-bugs.md keeps recording.
const GRAMMAR_NODE_TYPE_FILES = [
  "node_modules/tree-sitter-typescript/typescript/src/node-types.json",
  "node_modules/tree-sitter-javascript/src/node-types.json",
  "node_modules/tree-sitter-python/src/node-types.json",
  "node_modules/tree-sitter-go/src/node-types.json",
  "node_modules/tree-sitter-rust/src/node-types.json",
  "node_modules/tree-sitter-java/src/node-types.json",
  "node_modules/tree-sitter-c/src/node-types.json",
  "node_modules/tree-sitter-cpp/src/node-types.json",
  "node_modules/tree-sitter-ruby/src/node-types.json",
];

interface NodeTypeEntry {
  type: string;
  named: boolean;
}

let namedTypes: Set<string>;
let rubyNamedTypes: Set<string>;

/** Collects the named node types a grammar declares. */
async function readNamedTypes(file: string): Promise<string[]> {
  const entries = JSON.parse(await readFile(file, "utf-8")) as NodeTypeEntry[];
  return entries.filter((e) => e.named).map((e) => e.type);
}

beforeAll(async () => {
  const perGrammar = await Promise.all(GRAMMAR_NODE_TYPE_FILES.map(readNamedTypes));
  namedTypes = new Set(perGrammar.flat());
  rubyNamedTypes = new Set(await readNamedTypes(GRAMMAR_NODE_TYPE_FILES.at(-1) ?? ""));
});

describe("complexity node names", () => {
  // All three metrics run off their own node list, and all three fail the same
  // way when a grammar renames something: the construct silently scores zero.
  it.each([
    ["cyclomatic decision", [...DECISION_TYPES, ...CONDITIONAL_ARM_TYPES]],
    ["cognitive control-flow", CONTROL_FLOW_TYPES],
    ["nesting", NESTING_TYPES],
  ])("declares no %s node type that no installed grammar emits", (_label, types) => {
    const orphans = types.filter((type) => !namedTypes.has(type));

    expect(orphans).toEqual([]);
  });

  it("keeps the bare keyword names Ruby-exclusive", () => {
    // These entries look like keyword tokens because in eight of the nine grammars
    // that is exactly what they are. The walk's isNamed guard is only safe while
    // Ruby remains the sole grammar naming them.
    const bareKeywords = ["if", "unless", "while", "until", "for", "when"];

    for (const keyword of bareKeywords) {
      expect(rubyNamedTypes.has(keyword), `${keyword} should be named in Ruby`).toBe(true);
    }
  });
});

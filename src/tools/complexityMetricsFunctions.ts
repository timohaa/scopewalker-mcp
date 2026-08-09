import type Parser from "tree-sitter";
import { walkNode } from "../lib/astWalker.js";
import { getFunctionNodeTypes } from "../lib/treeSitter.js";
import type { FunctionComplexity, SupportedLanguage } from "../types/index.js";
import { calculateCyclomaticComplexity } from "./complexityMetricsCyclomatic.js";
import {
  calculateCognitiveComplexity,
  calculateNestingDepth,
  countParameters,
  extractFunctionName,
} from "./complexityMetricsHelpers.js";

/** Cyclomatic complexity above which a function is reported and flagged "high". Radon's scale. */
export const HIGH_CYCLOMATIC_THRESHOLD = 10;
/** Cyclomatic complexity above which a function is flagged "extreme". Radon's scale. */
export const EXTREME_CYCLOMATIC_THRESHOLD = 30;
/** Cap on reported functions per file, so one pathological file cannot flood the response. */
export const MAX_REPORTED_FUNCTIONS_PER_FILE = 10;

/** Everything measured for one function, including fields the wire format omits. */
export interface FunctionAnalysis {
  name: string;
  line: number;
  cyclomatic: number;
  cognitive: number;
  nesting: number;
  /** Null where countParameters does not recognise the node type, e.g. Java constructors. */
  parameters: number | null;
}

/** Roll-ups appended to a file's metrics. */
export interface FunctionRollUp {
  function_count: number;
  max_cyclomatic_complexity: number;
  avg_cyclomatic_complexity: number;
  max_cognitive_complexity: number;
}

/**
 * Measures every function in a file in a single pass.
 *
 * Scores cover the function's whole subtree, so a callback's decision points count
 * toward both the callback and its enclosing function. That matches get_functions,
 * findHotspots, and Sonar's treatment of lambdas, and it keeps nesting, cognitive
 * and cyclomatic on the same scope.
 */
export function collectFunctions(
  rootNode: Parser.SyntaxNode,
  language: SupportedLanguage
): FunctionAnalysis[] {
  // Hoisted: getFunctionNodeTypes rebuilds the array on every call.
  const funcTypes = getFunctionNodeTypes(language);
  const functions: FunctionAnalysis[] = [];

  walkNode(rootNode, (node) => {
    // The isNamed guard is load-bearing, not defensive — see getFunctionNodeTypes.
    if (!node.isNamed || !funcTypes.includes(node.type)) return;

    functions.push({
      name: extractFunctionName(node) ?? "<anonymous>",
      line: node.startPosition.row + 1,
      cyclomatic: calculateCyclomaticComplexity(node),
      cognitive: calculateCognitiveComplexity(node),
      nesting: calculateNestingDepth(node, 0, language),
      parameters: countParameters(node, language),
    });
  });

  return functions;
}

/** Aggregates per-function scores into the file-level roll-ups. */
export function rollUpFunctionMetrics(functions: FunctionAnalysis[]): FunctionRollUp {
  if (functions.length === 0) {
    return {
      function_count: 0,
      max_cyclomatic_complexity: 0,
      avg_cyclomatic_complexity: 0,
      max_cognitive_complexity: 0,
    };
  }

  const cyclomatic = functions.map((f) => f.cyclomatic);
  const total = cyclomatic.reduce((a, b) => a + b, 0);

  return {
    function_count: functions.length,
    max_cyclomatic_complexity: Math.max(...cyclomatic),
    avg_cyclomatic_complexity: Math.round((total / functions.length) * 10) / 10,
    max_cognitive_complexity: Math.max(...functions.map((f) => f.cognitive)),
  };
}

/** Picks the functions worth reporting: over the threshold, worst first, capped. */
export function selectReportedFunctions(functions: FunctionAnalysis[]): FunctionComplexity[] {
  return functions
    .filter((f) => f.cyclomatic > HIGH_CYCLOMATIC_THRESHOLD)
    .sort((a, b) => b.cyclomatic - a.cyclomatic || b.cognitive - a.cognitive || a.line - b.line)
    .slice(0, MAX_REPORTED_FUNCTIONS_PER_FILE)
    .map((f) => ({
      name: f.name,
      line: f.line,
      cyclomatic_complexity: f.cyclomatic,
      cognitive_complexity: f.cognitive,
      nesting_depth: f.nesting,
      severity: f.cyclomatic > EXTREME_CYCLOMATIC_THRESHOLD ? "extreme" : "high",
    }));
}

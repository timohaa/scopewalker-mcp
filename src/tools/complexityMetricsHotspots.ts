import type Parser from "tree-sitter";
import { walkNode } from "../lib/astWalker.js";
import type { ComplexityHotspot, ComplexityMetricsResult, FileComplexity } from "../types/index.js";
import type { FunctionAnalysis } from "./complexityMetricsFunctions.js";
import {
  HIGH_NESTING_THRESHOLD,
  HIGH_PARAMS_THRESHOLD,
  HIGH_COMPLEXITY_THRESHOLD,
  countJsxProps,
  extractJsxComponentName,
} from "./complexityMetricsHelpers.js";

/** Cross-file function tallies the summary needs, accumulated before files are limited. */
export interface FunctionStats {
  highComplexityFunctions: number;
  mostComplexFunction: ComplexityMetricsResult["summary"]["most_complex_function"];
}

/**
 * Identifies functions exceeding nesting or parameter thresholds.
 *
 * Takes the already-measured functions rather than re-walking for them: a second
 * function-node list here is how this file and lib/treeSitter.ts drifted apart in
 * the first place. The JSX pass stays node-based because props hang off elements,
 * not functions.
 */
export function findHotspots(
  rootNode: Parser.SyntaxNode,
  functions: FunctionAnalysis[]
): ComplexityHotspot[] {
  const hotspots: ComplexityHotspot[] = [];

  for (const fn of functions) {
    if (fn.nesting > HIGH_NESTING_THRESHOLD) {
      hotspots.push({
        function: fn.name,
        line: fn.line,
        issue: "nesting_depth",
        value: fn.nesting,
        recommendation: "Consider extracting nested logic into helper functions",
      });
    }

    if (fn.parameters !== null && fn.parameters > HIGH_PARAMS_THRESHOLD) {
      hotspots.push({
        function: fn.name,
        line: fn.line,
        issue: "parameters",
        value: fn.parameters,
        recommendation: "Consider using an options object or splitting the function",
      });
    }
  }

  walkNode(rootNode, (node) => {
    const jsxProps = countJsxProps(node);
    if (jsxProps !== null && jsxProps > HIGH_PARAMS_THRESHOLD) {
      const componentName = extractJsxComponentName(node) ?? "<unknown>";
      hotspots.push({
        function: componentName,
        line: node.startPosition.row + 1,
        issue: "jsx_props",
        value: jsxProps,
        recommendation:
          "Consider grouping props into a dedicated interface or splitting the component",
      });
    }
  });

  return hotspots;
}

/** Aggregates complexity metrics into summary statistics. */
export function calculateSummary(
  files: FileComplexity[],
  functionStats: FunctionStats
): ComplexityMetricsResult["summary"] {
  let totalHotspots = 0;
  let highComplexityFiles = 0;
  let mostComplexFile: { path: string; cognitive_complexity: number } | null = null;

  for (const file of files) {
    totalHotspots += file.hotspots.length;

    if (file.metrics.cognitive_complexity > HIGH_COMPLEXITY_THRESHOLD) {
      highComplexityFiles++;
    }

    if (
      !mostComplexFile ||
      file.metrics.cognitive_complexity > mostComplexFile.cognitive_complexity
    ) {
      mostComplexFile = {
        path: file.path,
        cognitive_complexity: file.metrics.cognitive_complexity,
      };
    }
  }

  return {
    files_analyzed: files.length,
    high_complexity_files: highComplexityFiles,
    high_complexity_functions: functionStats.highComplexityFunctions,
    total_hotspots: totalHotspots,
    most_complex_file: mostComplexFile,
    most_complex_function: functionStats.mostComplexFunction,
  };
}

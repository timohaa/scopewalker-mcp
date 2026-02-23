import type Parser from "tree-sitter";
import { walkNode } from "../lib/astWalker.js";
import type { ComplexityHotspot, FileComplexity, SupportedLanguage } from "../types/index.js";
import {
  HIGH_NESTING_THRESHOLD,
  HIGH_PARAMS_THRESHOLD,
  HIGH_COMPLEXITY_THRESHOLD,
  calculateNestingDepth,
  countParameters,
  countJsxProps,
  extractJsxComponentName,
  extractFunctionName,
} from "./complexityMetricsHelpers.js";

/** Identifies functions exceeding nesting or parameter thresholds. */
export function findHotspots(
  rootNode: Parser.SyntaxNode,
  language?: SupportedLanguage
): ComplexityHotspot[] {
  const hotspots: ComplexityHotspot[] = [];

  walkNode(rootNode, (node) => {
    const funcTypes = [
      "function_declaration",
      "function_definition",
      "method_definition",
      "method_declaration", // Java methods
      "arrow_function",
    ];

    if (funcTypes.includes(node.type)) {
      const funcName = extractFunctionName(node) ?? "<anonymous>";
      const line = node.startPosition.row + 1;

      const depth = calculateNestingDepth(node, 0);
      if (depth > HIGH_NESTING_THRESHOLD) {
        hotspots.push({
          function: funcName,
          line,
          issue: "nesting_depth",
          value: depth,
          recommendation: "Consider extracting nested logic into helper functions",
        });
      }

      const params = countParameters(node, language);
      if (params !== null && params > HIGH_PARAMS_THRESHOLD) {
        hotspots.push({
          function: funcName,
          line,
          issue: "parameters",
          value: params,
          recommendation: "Consider using an options object or splitting the function",
        });
      }
    }

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
export function calculateSummary(files: FileComplexity[]): {
  files_analyzed: number;
  high_complexity_files: number;
  total_hotspots: number;
  most_complex_file: { path: string; cognitive_complexity: number } | null;
} {
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
    total_hotspots: totalHotspots,
    most_complex_file: mostComplexFile,
  };
}

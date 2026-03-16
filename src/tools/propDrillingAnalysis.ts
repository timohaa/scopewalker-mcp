import { readFile } from "node:fs/promises";
import type Parser from "tree-sitter";
import { walkNode } from "../lib/astWalker.js";
import { detectLanguage, parseCode } from "../lib/treeSitter.js";
import type {
  FileParameterAnalysis,
  ParameterInfo,
  RiskLevel,
  ThreadedParameter,
} from "../types/propDrilling.js";
import { isFileWithinSizeLimit } from "../utils/fileGuards.js";
import { extractParameterNames, detectForwardedParameters } from "./propDrillingHelpers.js";

/** Parameter names that commonly appear across many functions without indicating prop drilling. */
export const COMMON_PARAMETER_NAMES = new Set([
  "id",
  "key",
  "className",
  "children",
  "style",
  "type",
  "name",
  "value",
  "onChange",
  "onClick",
  "options",
  "config",
  "callback",
  "event",
  "err",
  "error",
  "ctx",
  "context",
  "req",
  "res",
  "next",
  "data",
  "index",
  "item",
  "args",
  "props",
]);

/** Function node types across supported languages. */
const FUNCTION_TYPES = [
  "function_declaration",
  "function_definition",
  "method_definition",
  "method_declaration",
  "arrow_function",
  "function_expression",
  "function_item",
  "method",
  "singleton_method",
  "constructor_declaration",
];

/** Extracts the name of a function node. */
function getFunctionName(node: Parser.SyntaxNode): string {
  for (const child of node.children) {
    if (
      child.type === "identifier" ||
      child.type === "property_identifier" ||
      child.type === "field_identifier"
    ) {
      return child.text;
    }
    if (child.type === "function_declarator") {
      for (const grandchild of child.children) {
        if (grandchild.type === "identifier" || grandchild.type === "qualified_identifier") {
          return grandchild.text;
        }
      }
    }
  }
  return "<anonymous>";
}

/**
 * Analyzes a single file for parameter info: extracts params from every function
 * and detects forwarding.
 */
export async function analyzeFile(
  fullPath: string,
  relativePath: string
): Promise<FileParameterAnalysis | null> {
  const language = detectLanguage(fullPath);
  if (language === null) return null;

  const withinLimit = await isFileWithinSizeLimit(fullPath);
  if (!withinLimit) return null;

  let content: string;
  try {
    content = await readFile(fullPath, "utf-8");
  } catch {
    return null;
  }

  const tree = await parseCode(content, language);
  if (tree === null) return null;

  const parameters: ParameterInfo[] = [];

  walkNode(tree.rootNode, (node) => {
    if (!FUNCTION_TYPES.includes(node.type)) return;

    const funcName = getFunctionName(node);
    const paramNames = extractParameterNames(node, language);
    const forwardedNames = detectForwardedParameters(node, paramNames, language);
    const forwardedSet = new Set(forwardedNames);

    for (const name of paramNames) {
      parameters.push({
        name,
        functionName: funcName,
        line: node.startPosition.row + 1,
        isForwarded: forwardedSet.has(name),
      });
    }
  });

  return { path: relativePath, language, parameters };
}

/**
 * Aggregates parameter analyses across files to find threaded parameters.
 * A parameter is "threaded" when it appears in >= minOccurrences distinct functions.
 */
export function aggregateParameters(
  fileAnalyses: FileParameterAnalysis[],
  minOccurrences: number
): ThreadedParameter[] {
  const paramMap = new Map<
    string,
    { files: Set<string>; functions: string[]; forwardedCount: number; totalCount: number }
  >();

  for (const analysis of fileAnalyses) {
    for (const param of analysis.parameters) {
      let entry = paramMap.get(param.name);
      if (entry === undefined) {
        entry = { files: new Set(), functions: [], forwardedCount: 0, totalCount: 0 };
        paramMap.set(param.name, entry);
      }
      entry.files.add(analysis.path);
      entry.functions.push(param.functionName);
      entry.totalCount++;
      if (param.isForwarded) entry.forwardedCount++;
    }
  }

  const results: ThreadedParameter[] = [];

  for (const [name, entry] of paramMap) {
    if (entry.totalCount < minOccurrences) continue;

    const forwardingRatio = entry.forwardedCount / entry.totalCount;
    const risk = assignRisk(entry.totalCount, forwardingRatio);

    results.push({
      name,
      occurrences: entry.totalCount,
      files: [...entry.files],
      functions: entry.functions,
      forwarding_evidence: entry.forwardedCount,
      risk,
    });
  }

  return results.sort((a, b) => b.occurrences - a.occurrences);
}

/** Assigns risk level based on occurrence count and forwarding ratio. */
function assignRisk(occurrences: number, forwardingRatio: number): RiskLevel {
  if (occurrences >= 4 && forwardingRatio > 0.5) return "high";
  if (forwardingRatio > 0 && (occurrences >= 3 || (occurrences >= 2 && forwardingRatio > 0.5)))
    return "medium";
  return "low";
}

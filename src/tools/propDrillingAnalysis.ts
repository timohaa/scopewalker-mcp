import type Parser from "tree-sitter";
import { walkNode } from "../lib/astWalker.js";
import { walkSourceFiles, type SourceFile } from "../lib/sourceFileWalker.js";
import { parseCode } from "../lib/treeSitter.js";
import type {
  FileParameterAnalysis,
  ParameterInfo,
  RiskLevel,
  ThreadedParameter,
} from "../types/propDrilling.js";
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
async function analyzeFile({
  relativePath,
  language,
  code,
}: SourceFile): Promise<FileParameterAnalysis | null> {
  const tree = await parseCode(code, language);
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

/** Analyzes every scanned file, returning per-file parameters and the scan total. */
export async function analyzeFilesForParameters(
  filePaths: string[],
  basePath: string,
  isDirectory: boolean,
  maxFiles?: number
): Promise<{ fileAnalyses: FileParameterAnalysis[]; totalParamsScanned: number }> {
  const fileAnalyses: FileParameterAnalysis[] = [];
  let totalParamsScanned = 0;

  for await (const file of walkSourceFiles(filePaths, basePath, isDirectory, maxFiles)) {
    const analysis = await analyzeFile(file);
    if (analysis === null) continue;

    fileAnalyses.push(analysis);
    totalParamsScanned += analysis.parameters.length;
  }

  return { fileAnalyses, totalParamsScanned };
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

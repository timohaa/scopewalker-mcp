import type { FileDocumentation, UndocumentedItem } from "../types/index.js";
import type { DocSymbol } from "./documentationCoverageAnalysis.js";

/** Coverage totals after C/C++ declarations are joined with their definitions. */
export interface CoverageTally {
  byFile: FileDocumentation[];
  undocumentedItems: UndocumentedItem[];
  totalDocumented: number;
  totalUndocumented: number;
}

/** How a symbol is counted, if it is counted at all. */
interface Counted {
  documented: boolean;
  lines: number;
}

/** Headers, where a C/C++ declaration is reported in preference to its definition. */
const HEADER_EXTENSION = /\.(?:h|hh|hpp|hxx)$/i;

/** Groups items by a derived key, keeping first-seen order. */
function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

/**
 * Picks the file whose copies of a symbol are reported: the one with the most
 * copies (overloads share a name), preferring a header so the item points at
 * the declaration.
 */
function reportedCopies(group: DocSymbol[]): DocSymbol[] {
  let best: DocSymbol[] = [];
  for (const [path, copies] of groupBy(group, (symbol) => symbol.item.path)) {
    const beatsBest =
      copies.length > best.length ||
      (copies.length === best.length &&
        HEADER_EXTENSION.test(path) &&
        !HEADER_EXTENSION.test(best[0]?.item.path ?? ""));
    if (beatsBest) best = copies;
  }
  return best;
}

/**
 * Decides how each C/C++ symbol is counted once its group is merged.
 *
 * A header declaration and its `.cpp` definition count once and are documented
 * when either has a doc comment. Overloads share a key, so a group counts as
 * many symbols as its largest single-file copy, all documented when any copy
 * is. That leans toward missing an undocumented overload, never toward a false
 * report. A group with any private or file-local copy is left out entirely.
 */
function countMergedSymbols(symbols: DocSymbol[]): Map<DocSymbol, Counted> {
  const counted = new Map<DocSymbol, Counted>();
  const keyed = symbols.filter((symbol) => symbol.key !== null);

  for (const group of groupBy(keyed, (symbol) => symbol.key ?? "").values()) {
    if (group.some((symbol) => symbol.hidden)) continue;
    const documented = group.some((symbol) => symbol.documented);
    const lines = Math.max(...group.map((symbol) => symbol.item.lines ?? 1));
    for (const symbol of reportedCopies(group)) counted.set(symbol, { documented, lines });
  }
  return counted;
}

/** Adds one counted symbol to its file's tally. */
function addToFile(files: Map<string, FileDocumentation>, path: string, documented: boolean): void {
  const file = files.get(path) ?? { path, documented: 0, undocumented: 0, percentage: 0 };
  if (documented) file.documented++;
  else file.undocumented++;
  files.set(path, file);
}

/**
 * Counts symbols from every analyzed file, in scan order.
 * `min_lines` applies after merging, so a one-line header declaration does not
 * drop out while its longer definition stays in.
 */
export function tallyCoverage(symbols: DocSymbol[], minLines: number): CoverageTally {
  const merged = countMergedSymbols(symbols);
  const files = new Map<string, FileDocumentation>();
  const undocumentedItems: UndocumentedItem[] = [];
  let totalDocumented = 0;
  let totalUndocumented = 0;

  for (const symbol of symbols) {
    const counted =
      symbol.key === null
        ? { documented: symbol.documented, lines: symbol.item.lines ?? 1 }
        : merged.get(symbol);
    if (counted === undefined || counted.lines < minLines) continue;

    addToFile(files, symbol.item.path, counted.documented);
    if (counted.documented) {
      totalDocumented++;
    } else {
      totalUndocumented++;
      undocumentedItems.push({ ...symbol.item, lines: counted.lines });
    }
  }

  const byFile = [...files.values()].map((file) => ({
    ...file,
    percentage: Math.round((file.documented / (file.documented + file.undocumented)) * 1000) / 10,
  }));

  return { byFile, undocumentedItems, totalDocumented, totalUndocumented };
}

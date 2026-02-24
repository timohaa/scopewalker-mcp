/**
 * Documentation coverage helpers - barrel file.
 * Re-exports all documentation coverage helper functions for backward compatibility.
 */

export type { DocumentableNode } from "./documentationCoverageNodeDetection.js";
export { getDocumentableNode, extractName } from "./documentationCoverageNodeDetection.js";

export {
  JSDOC_LANGUAGES,
  isDocComment,
  isDocCommentText,
  isAnyComment,
} from "./documentationCoverageLanguageUtils.js";

export type {
  CoverageConfig,
  CoverageData,
  FileAnalysis,
  FileAnalysisOptions,
} from "./documentationCoverageAnalysis.js";
export {
  hasDocumentation,
  analyzeFileDocumentation,
  buildDocumentationCoverageResult,
} from "./documentationCoverageAnalysis.js";

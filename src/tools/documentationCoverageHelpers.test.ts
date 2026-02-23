import { describe, it, expect } from "vitest";
import * as analysis from "./documentationCoverageAnalysis.js";
import * as helpers from "./documentationCoverageHelpers.js";
import * as languageUtils from "./documentationCoverageLanguageUtils.js";
import * as detection from "./documentationCoverageNodeDetection.js";

describe("documentationCoverageHelpers barrel", () => {
  it("re-exports node detection helpers", () => {
    expect(helpers.getDocumentableNode).toBe(detection.getDocumentableNode);
    expect(helpers.extractName).toBe(detection.extractName);
  });

  it("re-exports language utilities", () => {
    expect(helpers.JSDOC_LANGUAGES).toBe(languageUtils.JSDOC_LANGUAGES);
    expect(helpers.isDocComment).toBe(languageUtils.isDocComment);
    expect(helpers.isDocCommentText).toBe(languageUtils.isDocCommentText);
    expect(helpers.isAnyComment).toBe(languageUtils.isAnyComment);
  });

  it("re-exports coverage analysis helpers", () => {
    expect(helpers.hasDocumentation).toBe(analysis.hasDocumentation);
    expect(helpers.analyzeFileDocumentation).toBe(analysis.analyzeFileDocumentation);
    expect(helpers.buildDocumentationCoverageResult).toBe(
      analysis.buildDocumentationCoverageResult
    );
  });
});

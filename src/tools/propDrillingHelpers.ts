/**
 * Re-exports parameter-name extraction and forwarding-detection helpers used
 * by the prop-drilling analysis. Split into `propDrillingParamNames.ts` and
 * `propDrillingForwarding.ts` to keep each module focused and under size limits.
 */
export { extractParameterNames } from "./propDrillingParamNames.js";
export { detectForwardedParameters } from "./propDrillingForwarding.js";

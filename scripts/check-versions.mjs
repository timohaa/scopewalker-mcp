#!/usr/bin/env node
// package.json is the single source of truth for the version. release.yml rewrites
// manifest.json and server.json from the git tag at publish time but never commits
// the result, so without this check the committed copies drift silently and mislead
// anyone reading the repo. Runs as part of `npm run check`, which is both the
// documented pre-commit gate and what CI runs.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Reads and parses a JSON file relative to the repository root. */
function readJson(file) {
  return JSON.parse(readFileSync(join(repoRoot, file), "utf8"));
}

const expected = readJson("package.json").version;
const manifest = readJson("manifest.json");
const server = readJson("server.json");

// Mirrors exactly the fields release.yml syncs, packages[].version included.
const checks = [
  ["manifest.json", "version", manifest.version],
  ["server.json", "version", server.version],
  ...server.packages.map((pkg, i) => [
    "server.json",
    `packages[${String(i)}].version`,
    pkg.version,
  ]),
];

const mismatches = checks.filter(([, , actual]) => actual !== expected);

if (mismatches.length > 0) {
  console.error(`Version mismatch: package.json declares ${expected}, but:`);
  for (const [file, field, actual] of mismatches) {
    console.error(`  ${file} ${field} = ${String(actual)}`);
  }
  console.error("\nUpdate the files above to match package.json.");
  process.exit(1);
}

console.log(`Versions consistent at ${expected}.`);

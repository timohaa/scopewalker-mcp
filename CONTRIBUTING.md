# Contributing to Scopewalker MCP

## Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Install tokei: `brew install tokei` (macOS) or `cargo install tokei`
4. Build: `npm run build`
5. Run tests: `npm run test`

## Commands

```bash
npm run build          # Build the project
npm run check          # Version sync + lint (with auto-fix) + typecheck
npm run lint           # Lint only, no auto-fix
npm run format         # Format src/ with prettier
npm run test           # Run tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage report
```

## Before Submitting

1. Run `npm run check` - fix all lint, type, and version-sync errors
2. Run `npm run test` - all tests must pass
3. Verify file/function size limits: use `check_thresholds` tool or review manually
4. Update documentation if adding new features

## Code Standards

- Keep files under 300 lines
- Keep functions under 100 lines
- Use existing libraries over custom implementations
- Add tests for new functionality
- Document exported functions with JSDoc comments

## Adding a New Tool

1. Create `src/tools/[toolName].ts` with the tool implementation
2. Create `src/types/[concern].ts` for type definitions (named by domain, e.g., `complexity.ts`, `thresholds.ts`)
3. Export types from `src/types/index.ts`
4. Register the tool in `createServer()` in `src/server.ts`, and add its name to `EXPECTED_TOOLS` in `src/server.test.ts`
5. Add tests in `src/tools/[toolName].test.ts`
6. Update every file that documents or enumerates the tool set:
   - `docs/tools-*.md`: full documentation in the appropriate file
   - `TOOLS.md`: quick reference table
   - `README.md`: tool list, and the tool count there and in `docs/tools-overview.md`
   - `docs/usage-examples.md`: the tool list in the example `AGENTS.md` snippet
   - `.claude/agents/standards-enforcer.md`: the tool table, if the tool reports a standards violation

## Pull Request Process

1. Create a feature branch from `main`
2. Make changes following the code standards
3. Run `npm run check` and fix any issues
4. Submit PR with clear description of changes
5. Ensure CI checks pass: `.github/workflows/ci.yml` runs `npm run check`, `npm run test:coverage`, and `npm run build` on every pull request. It fails if `npm run check` modifies a tracked file (commit the fixes it applies) or if coverage drops below the thresholds in `vitest.config.ts`

## Releasing (maintainers)

Releases are automated by `.github/workflows/release.yml`, triggered by a version tag:

`package.json`, `manifest.json`, and `server.json` all carry the version, and `npm run check:versions` (part of `npm run check`, which `prepublishOnly` runs) fails the release if they disagree. `npm version` only touches `package.json`, so bump all three in the same commit:

```bash
npm version patch --no-git-tag-version   # or minor / major; bumps package.json only
# set the same version in manifest.json, and in server.json's `version` and `packages[].version`
npm run check:versions                   # confirms all three agree

VERSION=$(node -p 'require("./package.json").version')
git commit -am "chore: release v$VERSION"
git tag "v$VERSION"
git push --follow-tags
```

The workflow runs checks and tests, publishes to npm with provenance, publishes to the [MCP Registry](https://registry.modelcontextprotocol.io), builds the `.mcpb` bundle (`npm run bundle:mcpb`, which can also be run locally to inspect the bundle), and attaches it to a GitHub Release. It also rewrites the version into `manifest.json` and `server.json` at publish time, but never commits the result, which is what `check:versions` guards against drifting.

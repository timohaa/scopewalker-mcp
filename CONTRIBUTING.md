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
npm run check          # Lint + typecheck
npm run test           # Run tests
npm run test:coverage  # Run tests with coverage report
```

## Before Submitting

1. Run `npm run check` - fix all lint and type errors
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
4. Register the tool in `src/index.ts`
5. Add tests in `src/tools/[toolName].test.ts`
6. Document in the appropriate `docs/tools-*.md` file and update the quick reference table in `TOOLS.md`

## Pull Request Process

1. Create a feature branch from `main`
2. Make changes following the code standards
3. Run `npm run check` and fix any issues
4. Submit PR with clear description of changes
5. Ensure CI checks pass

## Releasing (maintainers)

Releases are automated by `.github/workflows/release.yml`, triggered by a version tag:

```bash
npm version patch   # or minor / major — bumps package.json and creates the tag
git push --follow-tags
```

The workflow runs checks and tests, publishes to npm with provenance, publishes to the [MCP Registry](https://registry.modelcontextprotocol.io), builds the `.mcpb` bundle, and attaches it to a GitHub Release.

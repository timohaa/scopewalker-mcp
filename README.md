# Scopewalker MCP

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-ffdd00?logo=buy-me-a-coffee&logoColor=black)](https://www.buymeacoffee.com/thaanpaa)

AI agents will happily create 1000+ line source files and add a 20th parameter to a function call, even if there's a rule file telling them not to. Scopewalker exists to enforce stricter codebase standards.

It's a local MCP server (open source, runs over stdio, makes no network calls) that exposes 8 read-only tools:

- `get_line_counts` - per-file line counts (total, code, blank, comment) with sorting, extension filters, and project-wide totals
- `get_functions` - function and method detection; per-file counts, or per-function line metrics via `detail=lines` with a `min_lines` filter for hunting oversized functions
- `get_complexity_metrics` - max/average nesting depth and parameter counts (JSX props included), import counts, and a cognitive-complexity score per file, with hotspots flagged for deeply nested or over-parameterized functions
- `check_thresholds` - flags files and functions exceeding size thresholds (defaults: 300 lines per file, 100 per function)
- `get_code_inventory` - classes with their methods, functions, interfaces/types, enums, and constants, each marked exported or not; private symbols hidden by default
- `get_documentation_coverage` - coverage percentage plus every function, class, or method missing a doc comment (JSDoc, Python docstrings, Rust `///`, and other per-language formats)
- `get_code_smells` - TODO/FIXME/HACK/XXX/BUG/UNUSED/DEPRECATED markers found by scanning actual comments via the AST (no false positives from string literals), plus `as unknown as` casts in TypeScript
- `get_prop_drilling` - parameter names threaded through many functions and files, with forwarding evidence and a high/medium/low risk rating

It's tree-sitter (parsing) + tokei (line counting) + fast-glob (file discovery) under the hood; nothing is custom-parsed. Tested on macOS with Claude Code, but should work with Cursor, VS Code, Windsurf, Gemini CLI, Codex, or anything else that speaks MCP.

See [TOOLS.md](TOOLS.md) for the quick reference and [docs/](docs/) for per-tool parameters and example responses.

## Safety Defaults

- **No network access:** All analysis runs locally over stdio — no data leaves your machine, no API keys or external services involved.
- **Path scoping:** All tools only operate inside allowed roots (defaults: current working directory and system temp). Override with `SCOPEWALKER_ALLOWED_ROOTS=/abs/path1,/abs/path2`.
- **Large file guard:** AST-based tools skip files larger than 1 MB to avoid excessive memory/CPU use. Tokei-based line counts do not enforce this limit.
- **Output limits:** Tools default to returning 20 files/items unless `limit` is set.
- **Comment redaction:** `get_code_smells` redacts comment text by default; pass `include_text: true` to return snippets explicitly.

## Requirements

- Node.js 22+
- [tokei](https://github.com/XAMPPRocky/tokei) - Install via `brew install tokei` or `cargo install tokei`

## Installation

```bash
npm install
npm run build
```

## Configuration

### Claude Code

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "scopewalker-mcp": {
      "command": "node",
      "args": ["/path/to/scopewalker-mcp/dist/index.js"]
    }
  }
}
```

Or use the CLI:

```bash
claude mcp add scopewalker-mcp --scope user -- node /path/to/scopewalker-mcp/dist/index.js
```

See [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) for details.

### Cursor

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

```json
{
  "mcpServers": {
    "scopewalker-mcp": {
      "command": "node",
      "args": ["/path/to/scopewalker-mcp/dist/index.js"]
    }
  }
}
```

Or configure via File > Preferences > Cursor Settings > MCP.

See [Cursor MCP documentation](https://cursor.com/docs/mcp) for details.

### VS Code (GitHub Copilot)

Add to `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "scopewalker-mcp": {
      "command": "node",
      "args": ["/path/to/scopewalker-mcp/dist/index.js"]
    }
  }
}
```

Requires VS Code 1.102+ with Agent Mode enabled.

See [VS Code MCP documentation](https://code.visualstudio.com/docs/agent-customization/mcp-servers) for details.

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "scopewalker-mcp": {
      "command": "node",
      "args": ["/path/to/scopewalker-mcp/dist/index.js"]
    }
  }
}
```

Or configure via Windsurf Settings > Cascade > Manage MCPs.

See [Windsurf MCP documentation](https://docs.devin.ai/desktop/cascade/mcp) for details.

### Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "scopewalker-mcp": {
      "command": "node",
      "args": ["/path/to/scopewalker-mcp/dist/index.js"]
    }
  }
}
```

See [Gemini CLI MCP documentation](https://geminicli.com/docs/tools/mcp-server/) for details.

### OpenAI Codex CLI

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.scopewalker-mcp]
command = "node"
args = ["/path/to/scopewalker-mcp/dist/index.js"]
```

Or use the CLI:

```bash
codex mcp add scopewalker-mcp -- node /path/to/scopewalker-mcp/dist/index.js
```

See [Codex MCP documentation](https://developers.openai.com/codex/mcp/) for details.

## Usage

Once configured, the assistant calls Scopewalker's tools on its own — no special syntax needed. Ask things like:

- "Check this repo against our size thresholds before I commit"
- "Which functions in `src/` have the highest cognitive complexity?"
- "Find undocumented exports in `src/auth`"
- "Are there any TODO/FIXME/HACK markers left in this module?"
- "Show me functions that take more than 5 parameters"

It picks the right tool and parameters for the request.

This repo also dogfoods its own tools via Claude Code skills and agents:

- [`.claude/skills/check-quality/SKILL.md`](.claude/skills/check-quality/SKILL.md) — runs `check_thresholds` and `get_code_smells` as part of the quality gate
- [`.claude/agents/standards-enforcer.md`](.claude/agents/standards-enforcer.md) — uses the full tool set to find and fix standards violations
- [`.claude/agents/docs-reality-sync.md`](.claude/agents/docs-reality-sync.md) — uses `get_code_inventory` and `get_functions` to keep docs in sync with code

## Development

```bash
npm run build          # Build the project
npm run check          # Lint + typecheck
npm run test           # Run tests
npm run test:coverage  # Run tests with coverage
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [docs/patterns.md](docs/patterns.md) for tool registration, error handling, and testing patterns.

## Supported Languages

Function detection and parsing support:

- TypeScript/JavaScript
- Python
- Go
- Rust
- Java
- C/C++
- Ruby

## License

MIT

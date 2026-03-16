# Scopewalker MCP

An MCP (Model Context Protocol) server providing codebase analysis tools for AI assistants.

## Why Scopewalker?

AI coding agents perform better on codebases that follow complexity standards. Small, focused files and functions are easier to understand, modify safely, and fit within context windows. Scopewalker gives agents visibility into code health metrics, enabling them to:

- Verify size limits before committing (default: files <300 lines, functions <100 lines, configurable)
- Identify complex code that needs refactoring before modification
- Find undocumented code that may cause misunderstanding
- Navigate unfamiliar codebases efficiently

See [AGENTS.md](AGENTS.md) for a sample integration.

## Features

Scopewalker MCP provides 8 tools organized into three categories:

### Core Analysis

- `get_line_counts` - Line count metrics via tokei
- `get_functions` - Function counts and per-function line metrics

### Codebase Health

- `check_thresholds` - Find oversized files and functions
- `get_code_inventory` - Classes, methods, functions, and exports inventory
- `get_complexity_metrics` - Nesting depth, parameters, cognitive complexity

### Code Quality

- `get_documentation_coverage` - Undocumented symbol detection
- `get_code_smells` - Detect TODO, FIXME, HACK, BUG, and other markers plus unsafe casts
- `get_prop_drilling` - Detect parameter threading (prop drilling) across function chains

See [TOOLS.md](TOOLS.md) for detailed parameter and response documentation.

## Safety Defaults

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

See [Claude Code MCP documentation](https://docs.claude.com/en/docs/claude-code/mcp) for details.

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

See [Cursor MCP documentation](https://docs.cursor.com/context/model-context-protocol) for details.

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

See [VS Code MCP documentation](https://code.visualstudio.com/docs/copilot/customization/mcp-servers) for details.

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

See [Windsurf MCP documentation](https://docs.windsurf.com/windsurf/cascade/mcp) for details.

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

## Development

```bash
npm run build          # Build the project
npm run check          # Lint + typecheck
npm run test           # Run tests
npm run test:coverage  # Run tests with coverage
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## Supported Languages

Function detection and parsing support:

- TypeScript/JavaScript
- Python
- Go
- Rust
- Java
- C/C++
- Ruby

## Architecture

Scopewalker MCP is a thin orchestration layer over battle-tested libraries:

| Task             | Library     |
|------------------|-------------|
| Line counting    | tokei (CLI) |
| Code parsing     | tree-sitter |
| File discovery   | fast-glob   |
| Input validation | zod         |

## License

MIT

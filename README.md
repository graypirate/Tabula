<p align="center" width="100%">
<img width="120" alt="Tabula logo" src="./icon.png">
</p>

<h1 align="center">Tabula</h1>

<p align="center">Highly flexible object-oriented relational storage, built for LLM agents.</p>

**Tabula** organizes structured data and content in ordered trees that agents can access through a local command-line interface, or additional MCP package (preferred). Each workspace contains Objects and Blocks. Objects are named containers that define structure; Blocks hold content or records. Both can carry custom properties and contain other Objects or Blocks, allowing the same model to represent documents, datasets, tables, tasks, and other structured information.

## Requirements

Tabula requires [Bun](https://bun.sh/) 1.3 or newer.

```bash
bun --version
```

## Installation from Source

1. Download or clone the latest release of **Tabula**
2. Open terminal to the downloaded `Tabula` folder
3. Install dependencies and link both commands into `~/.bun/bin`:
```bash
bun run install:local
```
4. Verify both are available:
```bash
command -v tabula
command -v tabula-mcp
tabula list
```

This links the commands to the current checkout; changes to the source are available immediately. Remove those links with `bun run uninstall:local`. If `command -v` cannot find them, add `~/.bun/bin` to your `PATH`.

Installation does not create a workspace. Create the first workspace by [initializing](#initialization); Tabula then creates the managed storage directory at `~/.tabula` when needed.

### Registry Installation

After the packages are published, they can be installed independently from the npm registry:

- **[Core Package + CLI](./core/README.md#global-installation)**
- **[MCP](./mcp/README.md#global-installation)**

## Initialization
Unless you are querying workspaces directly, the user **does not** have to initialize before using with an LLM client. On creation/initialization of the first workspace, the managed workspace storage directory is created at `~/.tabula`.

See [CLI commands](./core/README.md#cli) for initialization.


## MCP Configuration

Add the MCP to your LLM client after [installation](#installation-from-source).

### Generic Client

Every stdio MCP client needs the same command and no arguments:

```json
{
  "mcpServers": {
    "tabula": {
      "command": "tabula-mcp",
      "args": []
    }
  }
}
```

Some clients use `mcp_servers` instead of `mcpServers`, but the launch contract
is unchanged. If a desktop client does not inherit your shell `PATH`, run
`command -v tabula-mcp` and use the returned absolute path as `command`.

### Codex

```bash
codex mcp add tabula -- tabula-mcp
codex mcp list
```

### OpenClaw

```bash
openclaw mcp add tabula --command tabula-mcp
openclaw mcp doctor tabula --probe
```

### Hermes

Add the server to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  tabula:
    command: tabula-mcp
    args: []
```

Restart Hermes so it discovers the server and registers its tools.

Upgrade or remove the optional adapter independently:

```bash
bun update --global tabula-mcp
bun remove --global tabula-mcp
```

## CLI Commands

The `tabula` CLI ships with the Core package. See commands, behavior, examples, and workspace rules in the [Core documentation](./core/README.md#cli).
  
## Storage and API Boundary

While workspaces are stored in SQLite, clients **always** pass workspace names, **never** SQLite paths. Managed workspaces live at `~/.tabula/<name>.sqlite`. **Do not** query or modify those files directly.

The public TypeScript API is exported by `tabula`. MCP depends only on that public package contract. SQLite storage types and containment tables remain internal implementation details.

## Development Installation

This repository is a Bun workspace containing two packages:

- `core/` publishes `tabula` and provides the `tabula` CLI.
- `mcp/` publishes `tabula-mcp` and depends on the local Core workspace.

From the repository root, install the workspace dependencies and link both
commands into `~/.bun/bin`:
```bash
bun run install:local
```

The links point at the current checkout, so source changes are available without
reinstalling. Verify the developer installation and run the project checks:
```bash
command -v tabula
command -v tabula-mcp
tabula list

bun test
bun run typecheck
```

Remove only the links owned by this checkout with:
```bash
bun run uninstall:local
```

If either command is not found, add `~/.bun/bin` to your `PATH`.

### Isolated Package Development

Use workspace filters when you only want Bun to install or run one package:

```bash
bun install --filter tabula
bun install --filter tabula-mcp

bun --filter tabula test
bun --filter tabula-mcp test
```

Targeting `tabula-mcp` also includes its local `tabula` dependency. This is package-isolated installation within the workspace, not a separate dependency universe: both packages still use the repository's root lockfile and workspace links.

Running plain `bun install` from `core/` or `mcp/` is not an isolated install. Bun discovers the parent workspace and installs the entire workspace, just as if the command had been run from the repository root. Use `--filter` when you intend to target one development package.

For complete isolation from the workspace, test a packed package in a temporary directory. Normal development should use either the full workspace install or a workspace filter.
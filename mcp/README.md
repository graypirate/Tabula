# Tabula MCP

Local stdio MCP server for Tabula. This package is a transport adapter and uses Tabula exclusively through the public `@graypirate/tabula` package API.

## Global Installation

Install the `tabula-mcp` executable and a compatible Tabula Core library with Bun:

```bash
bun add --global @graypirate/tabula-mcp
```

Or with npm:

```bash
npm install --global @graypirate/tabula-mcp
```

Bun is required at runtime regardless of which package manager installs it. [Install Tabula Core globally](../core/README.md#global-installation) separately if you also want the `tabula` CLI.

Verify:
```bash
command -v tabula-mcp
```

Upgrade or remove the MCP package with Bun:
```bash
bun update --global @graypirate/tabula-mcp
bun remove --global @graypirate/tabula-mcp

# npm equivalents
npm update --global @graypirate/tabula-mcp
npm uninstall --global @graypirate/tabula-mcp
```

Tabula MCP uses stdio. The MCP client starts and owns the server process; do not run it as a background daemon.

## Configure a Client

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

The client launches the server over stdio. No daemon is required. For desktop
clients that do not inherit the shell `PATH`, use the absolute path returned by
`command -v tabula-mcp`.

## Tools

- `tabula_initialize_workspace`
- `tabula_list_workspaces`
- `tabula_read_workspace`
- `tabula_list_workspace_entities`
- `tabula_read_entity`
- `tabula_list_entity_children`
- `tabula_search_entities`
- `tabula_create_object`
- `tabula_create_block`
- `tabula_write_entity`
- `tabula_delete_entity`
- `tabula_delete_workspace`

Each tool accepts one JSON object. The server does not accept CLI arguments,
stdin payloads, file payloads, SQLite paths, or hidden secondary inputs.

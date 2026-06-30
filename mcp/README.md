# Tabula MCP

Local stdio MCP server for Tabula. This package is a transport adapter and uses Tabula exclusively through the public `tabula` package API.

## Global Installation

After the package is published, this installs the `tabula-mcp` executable and a compatible Tabula Core library from the npm registry. [Install Tabula Core globally](../core/README.md#global-installation) as well when you want its standalone CLI.

```bash
bun add --global tabula-mcp
```

Verify:
```bash
command -v tabula-mcp
```

Upgrade or remove the MCP package with Bun:
```bash
bun update --global tabula-mcp
bun remove --global tabula-mcp
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

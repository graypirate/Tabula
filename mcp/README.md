# AgentDB MCP

Local stdio MCP server for AgentDB workspaces.

This package is separate from AgentDB core. It exposes AgentDB through MCP tools
and calls AgentDB only through public API exports.

## Install

```bash
cd /path/to/AgentDB/mcp
bun install
```

## Run

```bash
bun /path/to/AgentDB/mcp/src/index.ts
```

Example client config:

```toml
[mcp_servers.agentdb]
command = "bun"
args = ["/path/to/AgentDB/mcp/src/index.ts"]
```

## Tools

- `agentdb_initialize_workspace`
- `agentdb_list_workspaces`
- `agentdb_read_workspace`
- `agentdb_list_workspace_entities`
- `agentdb_read_entity`
- `agentdb_list_entity_children`
- `agentdb_search_entities`
- `agentdb_create_object`
- `agentdb_create_block`
- `agentdb_write_entity`
- `agentdb_delete_entity`
- `agentdb_delete_workspace`

Each tool accepts one JSON object. The server does not accept CLI arguments,
stdin payloads, file payloads, SQLite paths, or hidden secondary inputs.

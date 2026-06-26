#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerAgentDBTools } from "./tools/agentdb.ts";

export function createAgentDBMCPServer(): McpServer {
    const server = new McpServer({
        name: "agentdb-mcp-server",
        version: "0.0.5",
    });

    registerAgentDBTools(server);
    return server;
}

async function main(): Promise<void> {
    const server = createAgentDBMCPServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

if (import.meta.main) {
    await main().catch((error) => {
        console.error("Fatal MCP server error:", error);
        process.exit(1);
    });
}

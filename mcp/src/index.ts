#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import packageJSON from "../package.json" with { type: "json" };

import { registerTabulaTools } from "./tools/tabula.ts";

export function createTabulaMCPServer(): McpServer {
    const server = new McpServer({
        name: "tabula-mcp-server",
        version: packageJSON.version,
    });

    registerTabulaTools(server);
    return server;
}

async function main(): Promise<void> {
    const server = createTabulaMCPServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

if (import.meta.main) {
    await main().catch((error) => {
        console.error("Fatal MCP server error:", error);
        process.exit(1);
    });
}

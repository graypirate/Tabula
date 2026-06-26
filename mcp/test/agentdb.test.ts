import { afterEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createAgentDBMCPServer } from "../src/index.ts";
import { agentDBTools, MCPInputError } from "../src/tools/agentdb.ts";
import { AgentDBInputError, type Result, type WorkspaceMetadata } from "../../API";

let tempDirectory: string | undefined;
let originalHome: string | undefined;

afterEach(() => {
    if (tempDirectory) {
        rmSync(tempDirectory, { recursive: true, force: true });
        tempDirectory = undefined;
    }
    if (originalHome === undefined) {
        delete process.env.HOME;
    } else {
        process.env.HOME = originalHome;
    }
    originalHome = undefined;
});

describe("AgentDB MCP package", () => {
    test("defines the expected tool surface with strict schemas", () => {
        expect(agentDBTools.map((tool) => tool.name)).toEqual([
            "agentdb_initialize_workspace",
            "agentdb_list_workspaces",
            "agentdb_read_workspace",
            "agentdb_list_workspace_entities",
            "agentdb_read_entity",
            "agentdb_list_entity_children",
            "agentdb_search_entities",
            "agentdb_create_object",
            "agentdb_create_block",
            "agentdb_write_entity",
            "agentdb_delete_entity",
            "agentdb_delete_workspace",
        ]);

        for (const tool of agentDBTools) {
            expect(() => tool.inputSchema.parse({ argv: ["--workspace", "x"] })).toThrow();
            expect(() => tool.inputSchema.parse({ stdin: "{}" })).toThrow();
            expect(() => tool.inputSchema.parse({ file: "entity.json" })).toThrow();
        }
    });

    test("executes workspace and entity workflows through AgentDB public API", () => {
        useTempHome();

        const initialized = structured<WorkspaceMetadata>(execute(
            "agentdb_initialize_workspace",
            { workspace: "mcp_workspace" },
        ));
        expect(initialized).toMatchObject({
            id: expect.stringMatching(/^d_/),
            name: "mcp_workspace",
        });

        expect(structured<{ workspaces: string[] }>(execute("agentdb_list_workspaces", {}))).toEqual({
            workspaces: ["mcp_workspace"],
        });
        expect(structured<WorkspaceMetadata>(execute(
            "agentdb_read_workspace",
            { workspace: "mcp_workspace" },
        ))).toEqual(initialized);

        const object = structured<Result>(execute("agentdb_create_object", {
            workspace: "mcp_workspace",
            name: "Project",
            properties: { columns: ["status"] },
        }));
        const objectID = object.entity.id;
        const block = structured<Result>(execute("agentdb_create_block", {
            workspace: "mcp_workspace",
            parentID: objectID,
            content: "First row",
            properties: { status: "active" },
        }));
        const blockID = block.entity.id;

        expect(structured<{ objectIDs: string[] }>(execute("agentdb_list_workspace_entities", {
            workspace: "mcp_workspace",
        }))).toEqual({ objectIDs: [objectID] });
        expect(structured<{ childIDs: string[] }>(execute("agentdb_list_entity_children", {
            workspace: "mcp_workspace",
            id: objectID,
        }))).toEqual({ childIDs: [blockID] });
        expect(structured<{ results: { type: string; id: string; label: string }[] }>(execute(
            "agentdb_search_entities",
            { workspace: "mcp_workspace", query: "active", type: "block" },
        ))).toEqual({
            results: [{ type: "block", id: blockID, label: "First row" }],
        });

        const written = structured<Result>(execute("agentdb_write_entity", {
            workspace: "mcp_workspace",
            entity: {
                type: "object",
                name: "Document",
                properties: { kind: "note" },
                children: [{
                    type: "block",
                    content: "Section",
                    properties: { level: 1 },
                    children: [],
                }],
            },
        }));
        const writtenID = written.entity.id;

        expect(structured<Result>(execute("agentdb_read_entity", {
            workspace: "mcp_workspace",
            id: writtenID,
        }))).toEqual(written);
        expect(structured<{ deleted: boolean }>(execute("agentdb_delete_entity", {
            workspace: "mcp_workspace",
            id: blockID,
        }))).toEqual({ deleted: true });
        expect(structured<{ deleted: boolean }>(execute("agentdb_delete_workspace", {
            workspace: "mcp_workspace",
        }))).toEqual({ deleted: true });
    });

    test("rejects ambiguous inputs, invalid workspace names, and invalid write shapes", () => {
        expect(() => execute("agentdb_create_object", {
            workspace: "mcp",
            name: "Invalid",
            argv: ["--property", "status=active"],
        })).toThrow();
        expect(() => execute("agentdb_write_entity", {
            workspace: "mcp",
            stdin: "{}",
            entity: {
                type: "object",
                name: "Invalid",
                properties: {},
                children: [],
            },
        })).toThrow();
        expect(() => execute("agentdb_initialize_workspace", {
            workspace: "../notes",
        })).toThrow(MCPInputError);
        expect(() => execute("agentdb_create_block", {
            workspace: "mcp",
            parentID: "d_workspace",
            content: "Invalid",
        })).toThrow(MCPInputError);
        expect(() => execute("agentdb_write_entity", {
            workspace: "mcp",
            entity: {
                type: "object",
                name: "Invalid",
                content: "wrong shape",
                properties: {},
                children: [],
            },
        })).toThrow(AgentDBInputError);
    });

    test("lists and calls tools through the SDK server transport", async () => {
        useTempHome();

        const server = createAgentDBMCPServer();
        const client = new Client({ name: "agentdb-mcp-test", version: "0.0.0" });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([
            server.connect(serverTransport),
            client.connect(clientTransport),
        ]);

        try {
            const listed = await client.listTools();
            expect(listed.tools.map((tool) => tool.name)).toEqual(agentDBTools.map((tool) => tool.name));
            expect(listed.tools.find((tool) => tool.name === "agentdb_create_object")?.inputSchema)
                .toMatchObject({
                    type: "object",
                    properties: {
                        workspace: { type: "string" },
                        name: { type: "string" },
                    },
                    required: ["workspace", "name"],
                });

            const result = await client.callTool({
                name: "agentdb_initialize_workspace",
                arguments: { workspace: "sdk" },
            });
            expect(result.structuredContent).toMatchObject({
                id: expect.stringMatching(/^d_/),
                name: "sdk",
            });
            const content = result.content as { type: "text"; text: string }[];
            expect(JSON.parse(content[0]?.text ?? "{}")).toEqual(result.structuredContent);

            const invalidWrite = await client.callTool({
                name: "agentdb_write_entity",
                arguments: {
                    workspace: "sdk",
                    entity: {
                        type: "object",
                        name: "Invalid",
                        content: "wrong shape",
                        children: [],
                    },
                },
            });
            expect(invalidWrite.isError).toBe(true);
            expect(invalidWrite.structuredContent).toMatchObject({
                error: {
                    code: "UNKNOWN_FIELD",
                },
            });
        } finally {
            await client.close();
            await server.close();
        }
    });
});

function useTempHome(): void {
    tempDirectory = mkdtempSync(join(tmpdir(), "agentdb-mcp-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDirectory;
}

function execute(name: string, input: unknown): ReturnType<typeof agentDBTools[number]["execute"]> {
    const tool = agentDBTools.find((candidate) => candidate.name === name);
    if (tool === undefined) {
        throw new Error(`Missing tool: ${name}`);
    }
    return tool.execute(input);
}

function structured<T>(result: { structuredContent: unknown; content: [{ text: string }] }): T {
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
    return result.structuredContent as T;
}

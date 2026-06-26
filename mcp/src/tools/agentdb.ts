import type { Database } from "bun:sqlite";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
    create,
    deleteEntity,
    deleteWorkspace,
    initializeWorkspace,
    listEntity,
    listWorkspace,
    openWorkspace,
    readEntity,
    readWorkspace,
    search,
    validateWriteInput,
    writeEntity,
    AgentDBInputError,
    type Create,
    type JSONRecord,
    type SearchType,
    type Write,
} from "../../../API";
import {
    getWorkspaceNames,
    InvalidWorkspaceNameError,
    validateWorkspaceName,
} from "../../../core/workspace";

export class MCPInputError extends Error {
    override readonly name = "MCPInputError";

    constructor(readonly code: string, message: string, readonly details?: unknown) {
        super(message);
    }
}

type ToolAnnotations = {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
};

type ToolResult = {
    content: [{ type: "text"; text: string }];
    structuredContent: Record<string, unknown>;
    isError?: true;
};

type AgentDBTool = {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<z.ZodRawShape>;
    annotations: ToolAnnotations;
    execute: (input: unknown) => ToolResult;
};

const workspaceSchema = z.object({
    workspace: z.string().min(1),
}).strict();

const emptySchema = z.object({}).strict();

const entityIDSchema = z.object({
    workspace: z.string().min(1),
    id: z.string().min(1),
}).strict();

const searchSchema = z.object({
    workspace: z.string().min(1),
    query: z.string(),
    type: z.enum(["object", "block"]).optional(),
}).strict();

const propertiesSchema = z.record(z.unknown()).optional();

const createObjectSchema = z.object({
    workspace: z.string().min(1),
    name: z.string(),
    properties: propertiesSchema,
    parentID: z.string().min(1).optional(),
}).strict();

const createBlockSchema = z.object({
    workspace: z.string().min(1),
    content: z.string(),
    properties: propertiesSchema,
    parentID: z.string().min(1),
}).strict();

const writeEntitySchema = z.object({
    workspace: z.string().min(1),
    parentID: z.string().min(1).optional(),
    entity: z.unknown(),
}).strict();

export const agentDBTools: AgentDBTool[] = [
    {
        name: "agentdb_initialize_workspace",
        title: "Initialize AgentDB Workspace",
        description: "Create or open a managed AgentDB workspace by workspace name.",
        inputSchema: workspaceSchema,
        annotations: mutation({ idempotentHint: true }),
        execute(input) {
            const { workspace } = parseWorkspaceInput(input);
            return result(withInitializedWorkspace(workspace, readWorkspace));
        },
    },
    {
        name: "agentdb_list_workspaces",
        title: "List AgentDB Workspaces",
        description: "List managed AgentDB workspace names.",
        inputSchema: emptySchema,
        annotations: readOnly(),
        execute(input) {
            emptySchema.parse(input);
            return result({ workspaces: getWorkspaceNames() });
        },
    },
    {
        name: "agentdb_read_workspace",
        title: "Read AgentDB Workspace",
        description: "Read workspace metadata by workspace name.",
        inputSchema: workspaceSchema,
        annotations: readOnly(),
        execute(input) {
            const { workspace } = parseWorkspaceInput(input);
            return result(withWorkspace(workspace, readWorkspace));
        },
    },
    {
        name: "agentdb_list_workspace_entities",
        title: "List Workspace Root Entities",
        description: "List ordered root object IDs for a workspace name.",
        inputSchema: workspaceSchema,
        annotations: readOnly(),
        execute(input) {
            const { workspace } = parseWorkspaceInput(input);
            return result(withWorkspace(workspace, (db) => ({ objectIDs: listWorkspace(db) })));
        },
    },
    {
        name: "agentdb_read_entity",
        title: "Read AgentDB Entity",
        description: "Read one object or block as a parent-aware recursive entity tree.",
        inputSchema: entityIDSchema,
        annotations: readOnly(),
        execute(input) {
            const { workspace, id } = parseEntityIDInput(input);
            rejectWorkspaceID(id);
            return result(withWorkspace(workspace, (db) => readEntity(db, id)));
        },
    },
    {
        name: "agentdb_list_entity_children",
        title: "List Entity Children",
        description: "List ordered direct child IDs for one object or block.",
        inputSchema: entityIDSchema,
        annotations: readOnly(),
        execute(input) {
            const { workspace, id } = parseEntityIDInput(input);
            rejectWorkspaceID(id);
            return result(withWorkspace(workspace, (db) => ({ childIDs: listEntity(db, id) })));
        },
    },
    {
        name: "agentdb_search_entities",
        title: "Search AgentDB Entities",
        description: "Search object names/properties and block content/properties in a workspace.",
        inputSchema: searchSchema,
        annotations: readOnly(),
        execute(input) {
            const { workspace, query, type } = parseSearchInput(input);
            return result(withWorkspace(workspace, (db) => ({ results: search(db, query, type) })));
        },
    },
    {
        name: "agentdb_create_object",
        title: "Create AgentDB Object",
        description: "Create one named object with optional properties and optional parent.",
        inputSchema: createObjectSchema,
        annotations: mutation({ idempotentHint: false }),
        execute(input) {
            const { workspace, createInput, parentID } = parseCreateObjectInput(input);
            return result(withWorkspace(workspace, (db) =>
                create(db, createInput, parentOptions(parentID))
            ));
        },
    },
    {
        name: "agentdb_create_block",
        title: "Create AgentDB Block",
        description: "Create one content block with optional properties under an object or block parent.",
        inputSchema: createBlockSchema,
        annotations: mutation({ idempotentHint: false }),
        execute(input) {
            const { workspace, createInput, parentID } = parseCreateBlockInput(input);
            return result(withWorkspace(workspace, (db) =>
                create(db, createInput, parentOptions(parentID))
            ));
        },
    },
    {
        name: "agentdb_write_entity",
        title: "Write AgentDB Entity Tree",
        description: "Create or replace one recursive public object or block entity tree.",
        inputSchema: writeEntitySchema,
        annotations: mutation({ idempotentHint: false }),
        execute(input) {
            const { workspace, entity, parentID } = parseWriteEntityInput(input);
            return result(withWorkspace(workspace, (db) =>
                writeEntity(db, entity, parentOptions(parentID))
            ));
        },
    },
    {
        name: "agentdb_delete_entity",
        title: "Delete AgentDB Entity",
        description: "Delete one object or block and its descendants.",
        inputSchema: entityIDSchema,
        annotations: destructive(),
        execute(input) {
            const { workspace, id } = parseEntityIDInput(input);
            rejectWorkspaceID(id);
            return result(withWorkspace(workspace, (db) => ({ deleted: deleteEntity(db, id) })));
        },
    },
    {
        name: "agentdb_delete_workspace",
        title: "Delete AgentDB Workspace",
        description: "Delete one managed workspace by workspace name.",
        inputSchema: workspaceSchema,
        annotations: destructive(),
        execute(input) {
            const { workspace } = parseWorkspaceInput(input);
            return result({ deleted: deleteWorkspace(workspace) });
        },
    },
];

export function registerAgentDBTools(server: McpServer): void {
    for (const tool of agentDBTools) {
        server.registerTool(
            tool.name,
            {
                title: tool.title,
                description: tool.description,
                inputSchema: tool.inputSchema.shape,
                annotations: tool.annotations,
            },
            async (input) => {
                try {
                    return tool.execute(input);
                } catch (error) {
                    return toolError(error);
                }
            },
        );
    }
}

function parseWorkspaceInput(input: unknown): { workspace: string } {
    const value = workspaceSchema.parse(input);
    validateMCPWorkspaceName(value.workspace);
    return value;
}

function parseEntityIDInput(input: unknown): { workspace: string; id: string } {
    const value = entityIDSchema.parse(input);
    validateMCPWorkspaceName(value.workspace);
    inferMCPIDType(value.id);
    return value;
}

function parseSearchInput(input: unknown): {
    workspace: string;
    query: string;
    type?: SearchType;
} {
    const value = searchSchema.parse(input);
    validateMCPWorkspaceName(value.workspace);
    return value;
}

function parseCreateObjectInput(input: unknown): {
    workspace: string;
    createInput: Create;
    parentID?: string;
} {
    const value = createObjectSchema.parse(input);
    validateMCPWorkspaceName(value.workspace);
    if (value.parentID !== undefined) {
        inferMCPIDType(value.parentID);
    }
    return {
        workspace: value.workspace,
        createInput: {
            type: "object",
            name: value.name,
            properties: properties(value.properties),
        },
        ...(value.parentID === undefined ? {} : { parentID: value.parentID }),
    };
}

function parseCreateBlockInput(input: unknown): {
    workspace: string;
    createInput: Create;
    parentID: string;
} {
    const value = createBlockSchema.parse(input);
    validateMCPWorkspaceName(value.workspace);
    if (inferMCPIDType(value.parentID) === "workspace") {
        throw new MCPInputError(
            "INVALID_PARENT",
            `Workspace parents can only contain objects: ${value.parentID}`,
        );
    }
    return {
        workspace: value.workspace,
        createInput: {
            type: "block",
            content: value.content,
            properties: properties(value.properties),
        },
        parentID: value.parentID,
    };
}

function parseWriteEntityInput(input: unknown): {
    workspace: string;
    entity: Write;
    parentID?: string;
} {
    const value = writeEntitySchema.parse(input);
    validateMCPWorkspaceName(value.workspace);
    if (value.parentID !== undefined) {
        inferMCPIDType(value.parentID);
    }
    return {
        workspace: value.workspace,
        entity: validateWriteInput(value.entity),
        ...(value.parentID === undefined ? {} : { parentID: value.parentID }),
    };
}

function withInitializedWorkspace<T>(workspace: string, callback: (db: Database) => T): T {
    const db = initializeWorkspace(workspace);
    try {
        return callback(db);
    } finally {
        db.close();
    }
}

function withWorkspace<T>(workspace: string, callback: (db: Database) => T): T {
    const db = openWorkspace(workspace);
    try {
        return callback(db);
    } finally {
        db.close();
    }
}

function validateMCPWorkspaceName(workspace: string): void {
    try {
        validateWorkspaceName(workspace);
    } catch (error) {
        if (error instanceof InvalidWorkspaceNameError) {
            throw new MCPInputError("INVALID_WORKSPACE_NAME", error.message, error.details);
        }
        throw error;
    }
}

function inferMCPIDType(id: string): "workspace" | "object" | "block" {
    switch (id.slice(0, 2)) {
        case "d_":
            return "workspace";
        case "o_":
            return "object";
        case "b_":
            return "block";
        default:
            throw new MCPInputError("INVALID_ID", `Unknown entity ID prefix: ${id}`);
    }
}

function rejectWorkspaceID(id: string): void {
    if (inferMCPIDType(id) === "workspace") {
        throw new MCPInputError("INVALID_ID", `Expected object or block ID: ${id}`);
    }
}

function properties(value: Record<string, unknown> | undefined): JSONRecord {
    if (value === undefined) {
        return {};
    }
    if (!isJSONValue(value)) {
        throw new MCPInputError("INVALID_FIELD", "Properties must contain only JSON values", {
            field: "properties",
        });
    }
    return value as JSONRecord;
}

function isJSONValue(value: unknown): boolean {
    if (
        value === null
        || typeof value === "string"
        || typeof value === "number"
        || typeof value === "boolean"
    ) {
        return true;
    }
    if (Array.isArray(value)) {
        return value.every(isJSONValue);
    }
    if (typeof value === "object") {
        return Object.values(value as Record<string, unknown>).every(isJSONValue);
    }
    return false;
}

function parentOptions(parentID: string | undefined): { parentID?: string } {
    return parentID === undefined ? {} : { parentID };
}

function result(output: unknown): ToolResult {
    const structuredContent = toRecord(output);
    return {
        content: [{ type: "text", text: JSON.stringify(structuredContent) }],
        structuredContent,
    };
}

function toolError(error: unknown): ToolResult {
    const output = {
        error: {
            code: error instanceof MCPInputError || error instanceof AgentDBInputError
                ? error.code
                : "OPERATION_FAILED",
            message: error instanceof Error ? error.message : String(error),
            ...((error instanceof MCPInputError || error instanceof AgentDBInputError)
                && error.details !== undefined
                ? { details: error.details }
                : {}),
        },
    };
    return {
        content: [{ type: "text", text: JSON.stringify(output) }],
        structuredContent: output,
        isError: true,
    };
}

function toRecord(output: unknown): Record<string, unknown> {
    if (output !== null && typeof output === "object" && !Array.isArray(output)) {
        return output as Record<string, unknown>;
    }
    return { value: output };
}

function readOnly(): ToolAnnotations {
    return {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
    };
}

function mutation(options: { idempotentHint: boolean }): ToolAnnotations {
    return {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: options.idempotentHint,
        openWorldHint: false,
    };
}

function destructive(): ToolAnnotations {
    return {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
    };
}

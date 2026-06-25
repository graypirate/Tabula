import {
    create,
    deleteEntity as deleteAPIEntity,
    initializeWorkspace,
    listEntity as listAPIEntity,
    listWorkspace,
    openWorkspace,
    readEntity as readAPIEntity,
    readWorkspace,
    search,
    writeEntity,
} from "../index.ts";
import { getWorkspaceNames } from "../core/workspace";
import { inferEntityType, type CLICommand } from "./arguments.ts";
import { CLIInputError, CLIOperationError } from "./errors.ts";
import type { WriteInput } from "./json.ts";
import { parseProperties } from "./properties.ts";

type WorkspaceDatabase = ReturnType<typeof openWorkspace>;

export function dispatchCommand(command: CLICommand, writeInput?: WriteInput): unknown {
    if (command.action === "init") {
        return withInitializedWorkspace(
            command.workspace,
            readWorkspace,
        );
    }
    if (command.action === "listWorkspaces") {
        return getWorkspaceNames();
    }

    const properties = command.action === "create"
        ? parseProperties(command.propertyValues)
        : {};

    let db: WorkspaceDatabase;
    try {
        db = openWorkspace(command.workspace);
    } catch (error) {
        throw operationError("WORKSPACE_OPEN_FAILED", error, {
            workspace: command.workspace,
        });
    }

    try {
        switch (command.action) {
            case "create": {
                switch (command.entity) {
                    case "object":
                        return create(db, {
                            type: "object",
                            name: command.name,
                            properties,
                        }, createOptions(command.parentID));
                    case "block":
                        return create(db, {
                            type: "block",
                            content: command.content,
                            properties,
                        }, createOptions(command.parentID));
                }
            }
            case "write":
                if (writeInput === undefined) {
                    throw new Error("Validated write input is required");
                }
                return writeEntity(db, writeInput.value);
            case "read":
                return command.id === undefined
                    ? readWorkspace(db)
                    : readCommandEntity(db, command.id);
            case "list":
                return command.id === undefined
                    ? listWorkspace(db)
                    : listCommandEntity(db, command.id);
            case "delete":
                return deleteCommandEntity(db, command.id);
            case "search":
                return search(db, command.query, command.type);
        }
    } catch (error) {
        if (error instanceof CLIInputError || error instanceof CLIOperationError) {
            throw error;
        }
        throw operationError("OPERATION_FAILED", error);
    } finally {
        db.close();
    }
}

function withInitializedWorkspace(
    name: string,
    read: (db: WorkspaceDatabase) => unknown,
): unknown {
    let db: WorkspaceDatabase;
    try {
        db = initializeWorkspace(name);
    } catch (error) {
        throw operationError("WORKSPACE_INIT_FAILED", error, { workspace: name });
    }

    try {
        return read(db);
    } finally {
        db.close();
    }
}

function readCommandEntity(db: WorkspaceDatabase, id: string): unknown {
    switch (inferEntityType(id)) {
        case "workspace":
            return readMatchingWorkspace(db, id);
        case "object":
        case "block":
            return readAPIEntity(db, id);
    }
}

function listCommandEntity(db: WorkspaceDatabase, id: string): unknown {
    switch (inferEntityType(id)) {
        case "workspace":
            readMatchingWorkspace(db, id);
            return listWorkspace(db);
        case "object":
        case "block":
            return listAPIEntity(db, id);
    }
}

function deleteCommandEntity(db: WorkspaceDatabase, id: string): boolean {
    switch (inferEntityType(id)) {
        case "workspace":
            throw new CLIOperationError(
                "UNSUPPORTED_DELETE",
                "Workspace deletion is not supported",
            );
        case "object":
        case "block":
            return deleteAPIEntity(db, id);
    }
}

function createOptions(parentID: string | undefined): { parentID?: string } {
    return parentID === undefined ? {} : { parentID };
}

function readMatchingWorkspace(db: WorkspaceDatabase, id: string): ReturnType<typeof readWorkspace> {
    const metadata = readWorkspace(db);
    if (metadata.id !== id) {
        throw new CLIOperationError(
            "WORKSPACE_ID_MISMATCH",
            `Workspace ID ${id} does not match the opened workspace`,
            { actualID: metadata.id },
        );
    }
    return metadata;
}

function operationError(
    code: string,
    error: unknown,
    details?: Record<string, unknown>,
): CLIOperationError {
    const message = error instanceof Error ? error.message : String(error);
    return new CLIOperationError(code, message, details);
}

import {
    create,
    deleteEntity as deleteAPIEntity,
    initializeDatabase,
    listDatabase,
    listEntity as listAPIEntity,
    openDatabase,
    readDatabase,
    readEntity as readAPIEntity,
    search,
    writeEntity,
} from "../index.ts";
import { inferEntityType, type CLICommand } from "./arguments.ts";
import { CLIInputError, CLIOperationError } from "./errors.ts";
import type { WriteInput } from "./json.ts";
import { parseProperties } from "./properties.ts";

type Database = ReturnType<typeof openDatabase>;

export function dispatchCommand(command: CLICommand, writeInput?: WriteInput): unknown {
    if (command.action === "init") {
        return withInitializedDatabase(command.database, command.name, readDatabase);
    }

    const properties = command.action === "create"
        ? parseProperties(command.propertyValues)
        : {};

    let db: Database;
    try {
        db = openDatabase(command.database);
    } catch (error) {
        throw operationError("DATABASE_OPEN_FAILED", error, {
            path: command.database,
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
                return readCommandEntity(db, command.id);
            case "list":
                return listCommandEntity(db, command.id);
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

function withInitializedDatabase(
    path: string,
    name: string | undefined,
    read: (db: Database) => unknown,
): unknown {
    let db: Database;
    try {
        db = initializeDatabase(path, name);
    } catch (error) {
        throw operationError("DATABASE_INIT_FAILED", error, { path });
    }

    try {
        return read(db);
    } finally {
        db.close();
    }
}

function readCommandEntity(db: Database, id: string): unknown {
    switch (inferEntityType(id)) {
        case "database":
            return readMatchingDatabase(db, id);
        case "object":
        case "block":
            return readAPIEntity(db, id);
    }
}

function listCommandEntity(db: Database, id: string): unknown {
    switch (inferEntityType(id)) {
        case "database":
            readMatchingDatabase(db, id);
            return listDatabase(db);
        case "object":
        case "block":
            return listAPIEntity(db, id);
    }
}

function deleteCommandEntity(db: Database, id: string): boolean {
    switch (inferEntityType(id)) {
        case "database":
            throw new CLIOperationError(
                "UNSUPPORTED_DELETE",
                "Database deletion is not supported",
            );
        case "object":
        case "block":
            return deleteAPIEntity(db, id);
    }
}

function createOptions(parentID: string | undefined): { parentID?: string } {
    return parentID === undefined ? {} : { parentID };
}

function readMatchingDatabase(db: Database, id: string): ReturnType<typeof readDatabase> {
    const metadata = readDatabase(db);
    if (metadata.id !== id) {
        throw new CLIOperationError(
            "DATABASE_ID_MISMATCH",
            `Database ID ${id} does not match the opened database`,
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

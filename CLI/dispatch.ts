import {
    createBlock,
    createObject,
    createSilo,
    deleteBlock,
    deleteObject,
    deleteSilo,
    initializeDatabase,
    listBlock,
    listDatabase,
    listObject,
    listSilo,
    openDatabase,
    readBlock,
    readDatabase,
    readObject,
    readSilo,
    search,
    writeBlock,
    writeObject,
} from "../API/index.ts";
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
                    case "silo":
                        return createSilo(
                            db,
                            command.parentID,
                            command.name,
                            properties,
                        );
                    case "object":
                        return createObject(
                            db,
                            command.parentID,
                            command.name,
                            properties,
                        );
                    case "block":
                        return createBlock(db, command.content, properties);
                }
            }
            case "write":
                if (writeInput === undefined) {
                    throw new Error("Validated write input is required");
                }
                return writeInput.entity === "object"
                    ? writeObject(db, writeInput.value)
                    : writeBlock(db, writeInput.value);
            case "read":
                return readEntity(db, command.id);
            case "list":
                return listEntity(db, command.id, command.objectID);
            case "delete":
                return deleteEntity(db, command.id);
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

function readEntity(db: Database, id: string): unknown {
    switch (inferEntityType(id)) {
        case "database":
            return readMatchingDatabase(db, id);
        case "silo":
            return readSilo(db, id);
        case "object":
            return readObject(db, id);
        case "block":
            return readBlock(db, id);
    }
}

function listEntity(db: Database, id: string, objectID?: string): unknown {
    switch (inferEntityType(id)) {
        case "database":
            readMatchingDatabase(db, id);
            return listDatabase(db);
        case "silo":
            return listSilo(db, id);
        case "object":
            return listObject(db, id);
        case "block":
            return listBlock(db, id, objectID);
    }
}

function deleteEntity(db: Database, id: string): boolean {
    switch (inferEntityType(id)) {
        case "database":
            throw new CLIOperationError(
                "UNSUPPORTED_DELETE",
                "Database deletion is not supported",
            );
        case "silo":
            return deleteSilo(db, id);
        case "object":
            return deleteObject(db, id);
        case "block":
            return deleteBlock(db, id);
    }
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

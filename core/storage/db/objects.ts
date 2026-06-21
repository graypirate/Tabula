import type { Database } from "bun:sqlite";

import type { ObjID, ObjMetadata } from "../../types/object";
import { ObjectPrefix } from "../../utils/id";
import {
    deleteStoredEntitySubtrees,
    insertStoredEntity,
    upsertStoredEntity,
} from "./entities";
import type { StoredObject } from "../types";

type ObjectRow = {
    id: string;
    name: string;
    properties: string;
};

/**
 * Inserts an object row without adding database-root or child containment edges.
 * @param db - The database containing the object
 * @param metadata - The object metadata to insert
 */
export function insertStoredObject(db: Database, metadata: StoredObject): void {
    validateObjectMetadata(metadata);

    const insert = db.transaction(() => {
        insertStoredEntity(db, { type: "object", id: metadata.id });
        db.query(`
            INSERT INTO objects (id, name, properties)
            VALUES ($id, $name, $properties)
        `).run(mapObjectParameters(metadata));
    });

    insert();
}

/**
 * Inserts or updates an object row without changing containment edges.
 * @param db - The database containing the object
 * @param metadata - The object metadata to persist
 */
export function upsertStoredObject(db: Database, metadata: StoredObject): void {
    validateObjectMetadata(metadata);

    const upsert = db.transaction(() => {
        const exists = isStoredObject(db, metadata.id);
        upsertStoredEntity(db, { type: "object", id: metadata.id });

        if (exists) {
            db.query(`
                UPDATE objects
                SET name = $name,
                    properties = $properties
                WHERE id = $id
            `).run(mapObjectParameters(metadata));
            return;
        }

        db.query(`
            INSERT INTO objects (id, name, properties)
            VALUES ($id, $name, $properties)
        `).run(mapObjectParameters(metadata));
    });

    upsert();
}

/**
 * Reads object metadata without recursive children.
 * @param db - The database containing the object
 * @param objectID - The object ID to read
 * @returns The object metadata
 */
export function getObjectMetadata(db: Database, objectID: ObjID): ObjMetadata {
    const row = db.query(`
        SELECT id, name, properties
        FROM objects
        WHERE id = $id
    `).get({ $id: objectID }) as ObjectRow | null;

    if (!row) {
        throw new Error(`Object not found: ${objectID}`);
    }

    return {
        id: row.id,
        type: "object",
        name: row.name,
        properties: JSON.parse(row.properties) as Record<string, unknown>,
    };
}

/**
 * Reads the stored object row without recursive children.
 * @param db - The database containing the object
 * @param objectID - The object ID to read
 * @returns The stored object metadata
 */
export function getStoredObject(db: Database, objectID: ObjID): StoredObject {
    return getObjectMetadata(db, objectID);
}

/**
 * Updates object metadata without changing containment edges.
 * @param db - The database containing the object
 * @param metadata - The object metadata to update
 */
export function updateObjectMetadata(db: Database, metadata: StoredObject): void {
    validateObjectMetadata(metadata);

    if (!isStoredObject(db, metadata.id)) {
        throw new Error(`Object not found: ${metadata.id}`);
    }

    db.query(`
        UPDATE objects
        SET name = $name,
            properties = $properties
        WHERE id = $id
    `).run(mapObjectParameters(metadata));
}

/**
 * Updates the stored object row without changing recursive children.
 * @param db - The database containing the object
 * @param object - The object metadata to update
 */
export function updateStoredObject(db: Database, object: StoredObject): void {
    updateObjectMetadata(db, object);
}

/**
 * Deletes an object and its recursive containment subtree.
 * @param db - The database containing the object
 * @param objectID - The object ID to delete
 * @returns True if the object existed and was deleted
 */
export function deleteStoredObject(db: Database, objectID: ObjID): boolean {
    return deleteStoredEntitySubtrees(db, [objectID]) > 0;
}

/**
 * Checks whether an object row exists.
 * @param db - The database to check
 * @param objectID - The object ID to check
 * @returns True if the object exists
 */
export function isStoredObject(db: Database, objectID: ObjID): boolean {
    return db.query("SELECT 1 FROM objects WHERE id = $id").get({ $id: objectID }) !== null;
}

/** Validates an object ID. */
function validateObjectMetadata(metadata: StoredObject): void {
    if (!metadata.id.startsWith(`${ObjectPrefix}_`)) {
        throw new Error(`Invalid object id: ${metadata.id}`);
    }
}

/** Maps object metadata to SQLite named parameters. */
function mapObjectParameters(metadata: StoredObject): Record<string, string> {
    return {
        $id: metadata.id,
        $name: metadata.name,
        $properties: JSON.stringify(metadata.properties ?? {}),
    };
}

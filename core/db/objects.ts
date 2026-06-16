import type { Database } from "bun:sqlite";

import { getBlockPlacements, syncBlockPlacements } from "./blocks";
import type { ObjMetadata, ObjID } from "../types/object";
import { DatabasePrefix, ObjectPrefix, SiloPrefix } from "../utils/id";
import type { StoredObject } from "./types";

type ObjectRow = {
    id: string;
    parentID: string;
    name: string;
    properties: string;
};

/**
 * Inserts a new object.
 * @param db - The database containing the object
 * @param metadata - The object metadata to insert
 */
export function insertStoredObject(db: Database, metadata: ObjMetadata): void {
    validateObjectMetadata(db, metadata);

    if (isStoredObject(db, metadata.id)) {
        throw new Error(`Object already exists: ${metadata.id}`);
    }

    db.query(`
        INSERT INTO objects (id, parent_id, name, properties)
        VALUES ($id, $parentID, $name, $properties)
    `).run(mapObjectParameters(metadata));
}

/**
 * Reads object metadata without its blocks.
 * This function does not read the object's blocks.
 *
 * @param db - The database containing the object
 * @param ObjectID - The ID of the object to read
 * @returns The ObjMetadata at the ID
 */
export function getObjectMetadata(db: Database, ObjectID: ObjID): ObjMetadata {
    const row = db.query(`
        SELECT
            id,
            parent_id AS parentID,
            name,
            properties
        FROM objects
        WHERE id = $id
    `).get({ $id: ObjectID }) as ObjectRow | null;

    if (!row) {
        throw new Error(`Object not found: ${ObjectID}`);
    }

    return {
        id: row.id,
        parentID: row.parentID,
        name: row.name,
        properties: JSON.parse(row.properties) as Record<string, unknown>,
    };
}

/**
 * Reads an object's metadata and its blocks.
 * @param db - The database containing the object
 * @param ObjectID - The ID of the object to read
 * @returns The stored object at the specified ID
 */
export function getStoredObject(db: Database, ObjectID: ObjID): StoredObject {
    return {
        ...getObjectMetadata(db, ObjectID),
        blocks: getBlockPlacements(db, ObjectID),
    };
}

/**
 * Updates object metadata.
 * @param db - The database containing the object
 * @param metadata - The object metadata to update
 */
export function updateObjectMetadata(db: Database, metadata: ObjMetadata): void {
    if (!isStoredObject(db, metadata.id)) {
        throw new Error(`Object not found: ${metadata.id}`);
    }

    validateObjectMetadata(db, metadata);
    
    db.query(`
        UPDATE objects
        SET parent_id = $parentID,
            name = $name,
            properties = $properties
        WHERE id = $id
    `).run(mapObjectParameters(metadata));
}

/**
 * Updates object and synchronizes its complete block subtree.
 * @param db - The database containing the object
 * @param object - The object to update
 */
export function updateStoredObject(db: Database, object: StoredObject): void {
    const update = db.transaction(() => {
        updateObjectMetadata(db, object);
        syncBlockPlacements(db, object.id, object.blocks);
    });

    update();
}

/**
 * Deletes the object at the specified ID.
 * @param db - The database containing the object
 * @param ObjectID - The object ID to delete
 * @returns True if the object was successfully deleted
 */
export function deleteStoredObject(db: Database, ObjectID: ObjID): boolean {
    return db.query("DELETE FROM objects WHERE id = $id").run({ $id: ObjectID }).changes > 0;
}

// MARK: -- Object Helpers

/**
 * Checks if the specified ID is an object.
 * @param db - The database to check
 * @param ObjectID - The object ID to check
 * @returns True if the ID is an object
 */
export function isStoredObject(db: Database, ObjectID: ObjID): boolean {
    return db.query("SELECT 1 FROM objects WHERE id = $id").get({ $id: ObjectID }) !== null;
}

// MARK: -- Internal Helpers

/** Validates an object's ID and parent relationship. */
function validateObjectMetadata(db: Database, metadata: ObjMetadata): void {
    if (!metadata.id.startsWith(`${ObjectPrefix}_`)) {
        throw new Error(`Invalid object id: ${metadata.id}`);
    }

    validateParent(db, metadata.parentID);
}

/** Validates that an object's parent is an existing database or silo. */
function validateParent(db: Database, parentID: string): void {
    if (parentID.startsWith(`${DatabasePrefix}_`)) {
        if (!db.query('SELECT 1 FROM "database" WHERE id = $id').get({ $id: parentID })) {
            throw new Error(`Database parent not found: ${parentID}`);
        }
        return;
    }

    if (parentID.startsWith(`${SiloPrefix}_`)) {
        if (!db.query("SELECT 1 FROM silos WHERE id = $id").get({ $id: parentID })) {
            throw new Error(`Silo parent not found: ${parentID}`);
        }
        return;
    }

    throw new Error(`Object parent must be a database or silo: ${parentID}`);
}

/** Maps object metadata to named SQLite parameters. */
function mapObjectParameters(metadata: ObjMetadata): Record<string, string> {
    return {
        $id: metadata.id,
        $parentID: metadata.parentID,
        $name: metadata.name,
        $properties: JSON.stringify(metadata.properties ?? {}),
    };
}

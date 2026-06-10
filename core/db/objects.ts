import type { Database } from "bun:sqlite";

import { deleteBlocks, getBlocks, getDescendantBlocks, syncObjectBlocks } from "./blocks";
import type { ObjMetadata, Obj, ObjID } from "../types/object";
import { DatabasePrefix, ObjectPrefix, SiloPrefix } from "../utils/id";

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
export function insertObject(db: Database, metadata: ObjMetadata): void {
    validateObjectMetadata(db, metadata);

    if (isObject(db, metadata.id)) {
        throw new Error(`Object already exists: ${metadata.id}`);
    }

    db.query(`
        INSERT INTO objects (id, parent_id, name, properties)
        VALUES ($id, $parentID, $name, $properties)
    `).run(mapObjectParameters(metadata));
}

/**
 * Reads the object metadata (name+properties) at the specified ID.
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
 * Reads the object at the specified ID and returns the full object.
 * @param db - The database containing the object
 * @param ObjectID - The ID of the object to read
 * @returns The full Obj at the specified ID
 */
export function getObject(db: Database, ObjectID: ObjID): Obj {
    return {
        ...getObjectMetadata(db, ObjectID),
        blocks: getDescendantBlocks(db, ObjectID),
    };
}

/**
 * Updates the given object metadata.
 * @param db - The database containing the object
 * @param metadata - The object metadata to update
 */
export function updateObjectMetadata(db: Database, metadata: ObjMetadata): void {
    if (!isObject(db, metadata.id)) {
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
 * Updates the given object and synchronizes its complete block subtree.
 * @param db - The database containing the object
 * @param object - The object to update
 */
export function updateObject(db: Database, object: Obj): void {
    const update = db.transaction(() => {
        updateObjectMetadata(db, object);
        syncObjectBlocks(db, object.id, object.blocks);
    });

    update();
}

/**
 * Deletes the object at the specified ID.
 * @param db - The database containing the object
 * @param ObjectID - The object ID to delete
 * @returns True if the object was successfully deleted
 */
export function deleteObject(db: Database, ObjectID: ObjID): boolean {
    const remove = db.transaction(() => {
        const blockIDs = getBlocks(db, ObjectID).map((block) => block.id);
        deleteBlocks(db, blockIDs);
        return db.query("DELETE FROM objects WHERE id = $id").run({ $id: ObjectID }).changes > 0;
    });

    return remove();
}

// MARK: -- Object Helpers

/**
 * Checks if the specified ID is an object.
 * @param db - The database to check
 * @param ObjectID - The object ID to check
 * @returns True if the ID is an object
 */
export function isObject(db: Database, ObjectID: ObjID): boolean {
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

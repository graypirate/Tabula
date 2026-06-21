import type { Database } from "bun:sqlite";

import { BlockPrefix, DatabasePrefix, ObjectPrefix } from "../../utils/id";
import type { StoredEntityReference, StoredEntityType } from "../types";

type NodeTypeRow = {
    type: StoredEntityType;
};

/**
 * Inserts one graph node row.
 * @param db - The database containing the node
 * @param reference - The node type and ID to insert
 */
export function insertStoredNode(db: Database, reference: StoredEntityReference): void {
    validateNodeReference(reference);
    const existingType = getStoredNodeType(db, reference.id);
    if (existingType !== undefined) {
        throw new Error(`Entity already exists: ${reference.id}`);
    }

    db.query(`
        INSERT INTO nodes (id, type)
        VALUES ($id, $type)
    `).run({
        $id: reference.id,
        $type: reference.type,
    });
}

/**
 * Inserts one graph node row, or validates that an existing row has the same type.
 * @param db - The database containing the node
 * @param reference - The node type and ID to persist
 */
export function upsertStoredNode(db: Database, reference: StoredEntityReference): void {
    validateNodeReference(reference);
    const existingType = getStoredNodeType(db, reference.id);
    if (existingType !== undefined) {
        if (existingType !== reference.type) {
            throw new Error(`Entity ${reference.id} is a ${existingType}, not a ${reference.type}`);
        }
        return;
    }

    db.query(`
        INSERT INTO nodes (id, type)
        VALUES ($id, $type)
    `).run({
        $id: reference.id,
        $type: reference.type,
    });
}

/**
 * Checks whether a graph node exists.
 * @param db - The database to check
 * @param id - The node ID to check
 * @returns True if the node exists
 */
export function isStoredNode(db: Database, id: string): boolean {
    return getStoredNodeType(db, id) !== undefined;
}

/**
 * Reads the stored node type for an ID.
 * @param db - The database containing the node
 * @param id - The node ID to read
 * @returns The node type, or undefined when no node exists
 */
export function getStoredNodeType(db: Database, id: string): StoredEntityType | undefined {
    const row = db.query(`
        SELECT type
        FROM nodes
        WHERE id = $id
    `).get({ $id: id }) as NodeTypeRow | null;

    return row?.type;
}

/**
 * Deletes graph nodes by ID.
 * @param db - The database containing the nodes
 * @param ids - The node IDs to delete
 */
export function deleteStoredNodes(db: Database, ids: string[]): void {
    if (ids.length === 0) {
        return;
    }

    db.query(`
        DELETE FROM nodes
        WHERE id IN (SELECT value FROM json_each($ids))
    `).run({ $ids: JSON.stringify(ids) });
}

/** Validates that a node reference uses the correct ID prefix for its type. */
function validateNodeReference(reference: StoredEntityReference): void {
    if (reference.type === "database" && !reference.id.startsWith(`${DatabasePrefix}_`)) {
        throw new Error(`Invalid database id: ${reference.id}`);
    }
    if (reference.type === "object" && !reference.id.startsWith(`${ObjectPrefix}_`)) {
        throw new Error(`Invalid object id: ${reference.id}`);
    }
    if (reference.type === "block" && !reference.id.startsWith(`${BlockPrefix}_`)) {
        throw new Error(`Invalid block id: ${reference.id}`);
    }
}

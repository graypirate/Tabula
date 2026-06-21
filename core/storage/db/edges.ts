import type { Database } from "bun:sqlite";

import type { EntityReference } from "../../types/graph";
import type { ObjID } from "../../types/object";
import { BlockPrefix, DatabasePrefix, ObjectPrefix } from "../../utils/id";
import type { StoredEntityReference, StoredEntityType } from "../types";
import {
    getStoredNodeType,
    isStoredNode,
} from "./nodes";

type ChildRow = {
    id: string;
    type: StoredEntityType;
    position: number;
};

type ParentRow = {
    id: string;
    type: StoredEntityType;
};

/**
 * Reads the current direct parent for an object or block node.
 * @param db - The database containing the child node
 * @param childID - The object or block ID whose parent should be read
 * @returns The parent reference, or undefined when the child is unattached
 */
export function getEntityParent(db: Database, childID: string): StoredEntityReference | undefined {
    const childType = getStoredNodeType(db, childID);
    if (childType === undefined) {
        throw new Error(`Entity not found: ${childID}`);
    }
    if (childType === "database") {
        throw new Error(`Database cannot be a child entity: ${childID}`);
    }

    const row = db.query(`
        SELECT
            edges.parent_id AS id,
            nodes.type
        FROM edges
        JOIN nodes ON nodes.id = edges.parent_id
        WHERE edges.child_id = $childID
    `).get({ $childID: childID }) as ParentRow | null;

    return row === null
        ? undefined
        : {
            type: row.type,
            id: row.id,
        };
}

/**
 * Adds an object as a root child of the database.
 * @param db - The database containing the object
 * @param databaseID - The database parent ID
 * @param objectID - The object child ID
 */
export function appendDatabaseRootObject(db: Database, databaseID: string, objectID: ObjID): void {
    appendEntityChild(db, databaseID, { type: "object", id: objectID });
}

/**
 * Appends an existing object or block under a database, object, or block parent.
 * If the child already has a parent, it is moved to the new parent.
 * @param db - The database containing the parent and child
 * @param parentID - The database, object, or block parent ID
 * @param child - The object or block child to attach
 */
export function appendEntityChild(db: Database, parentID: string, child: EntityReference): void {
    validateParent(db, parentID);
    validateChildBatch(db, parentID, [child]);

    if (hasEntityChild(db, parentID, child.id)) {
        return;
    }

    const append = db.transaction(() => {
        detachEntityParent(db, child.id);

        const row = db.query(`
            SELECT COALESCE(MAX(position), -1) AS maxPosition
            FROM edges
            WHERE parent_id = $parentID
        `).get({ $parentID: parentID }) as { maxPosition: number };

        db.query(`
            INSERT INTO edges (parent_id, child_id, position)
            VALUES ($parentID, $childID, $position)
        `).run({
            $parentID: parentID,
            $childID: child.id,
            $position: row.maxPosition + 1,
        });

        validateNoEntityCycles(db);
    });

    append();
}

/**
 * Reads root object IDs ordered under the database.
 * @param db - The database to read
 * @param databaseID - The database ID whose root objects should be listed
 * @returns Ordered root object IDs
 */
export function getDatabaseRootObjects(db: Database, databaseID: string): ObjID[] {
    validateDatabaseParent(db, databaseID);
    const rows = db.query(`
        SELECT child_id AS id
        FROM edges
        JOIN nodes ON nodes.id = edges.child_id
        WHERE parent_id = $databaseID
          AND nodes.type = 'object'
        ORDER BY position
    `).all({ $databaseID: databaseID }) as { id: ObjID }[];

    return rows.map((row) => row.id);
}

/**
 * Reads direct child entity references for a database, object, or block parent.
 * @param db - The database containing the parent
 * @param parentID - The database or entity parent ID
 * @returns Ordered child entity references
 */
export function getDirectEntityChildren(db: Database, parentID: string): EntityReference[] {
    validateParent(db, parentID);
    const rows = db.query(`
        SELECT
            child_id AS id,
            nodes.type,
            position
        FROM edges
        JOIN nodes ON nodes.id = edges.child_id
        WHERE parent_id = $parentID
        ORDER BY position
    `).all({ $parentID: parentID }) as ChildRow[];

    return rows.map((row) => {
        if (row.type === "database") {
            throw new Error(`Database cannot be a child entity: ${row.id}`);
        }
        return {
            type: row.type,
            id: row.id,
        };
    });
}

/**
 * Replaces direct children for one or more parents.
 * @param db - The database containing the parents and children
 * @param desiredChildrenByParent - Complete desired child lists keyed by parent ID
 */
export function replaceEntityChildren(
    db: Database,
    desiredChildrenByParent: Map<string, EntityReference[]>,
): void {
    if (desiredChildrenByParent.size === 0) {
        return;
    }

    const replace = db.transaction(() => {
        const incomingChildIDs = new Set<string>();

        for (const [parentID, children] of desiredChildrenByParent) {
            validateParent(db, parentID);
            validateChildBatch(db, parentID, children);
            for (const child of children) {
                if (incomingChildIDs.has(child.id)) {
                    throw new Error(`Duplicate child entity: ${child.id}`);
                }
                incomingChildIDs.add(child.id);
            }
        }

        for (const parentID of desiredChildrenByParent.keys()) {
            db.query(`
                DELETE FROM edges
                WHERE parent_id = $parentID
            `).run({ $parentID: parentID });
        }

        const insert = db.query(`
            INSERT INTO edges (parent_id, child_id, position)
            VALUES ($parentID, $childID, $position)
        `);

        for (const [parentID, children] of desiredChildrenByParent) {
            children.forEach((child, position) => {
                detachEntityParent(db, child.id);
                insert.run({
                    $parentID: parentID,
                    $childID: child.id,
                    $position: position,
                });
            });
        }

        validateNoEntityCycles(db);
    });

    replace();
}

/**
 * Reads direct child IDs without joining subtype rows.
 * @param db - The database containing the parent
 * @param parentID - The parent ID to read
 * @returns Ordered child IDs
 */
export function getDirectEntityChildIDs(db: Database, parentID: string): string[] {
    return getDirectEntityChildren(db, parentID).map((child) => child.id);
}

/**
 * Removes the current parent edge for a child so it can be reparented or detached.
 * @param db - The database containing the edge
 * @param childID - The child ID to detach
 */
export function detachEntityParent(db: Database, childID: string): void {
    db.query(`
        DELETE FROM edges
        WHERE child_id = $childID
    `).run({ $childID: childID });
}

/** Checks whether any parent edge references an entity. */
export function hasEntityParent(db: Database, id: string): boolean {
    return db.query(`
        SELECT 1
        FROM edges
        WHERE child_id = $id
    `).get({ $id: id }) !== null;
}

/** Checks whether a direct parent/child edge already exists. */
function hasEntityChild(db: Database, parentID: string, childID: string): boolean {
    return db.query(`
        SELECT 1
        FROM edges
        WHERE parent_id = $parentID
          AND child_id = $childID
    `).get({
        $parentID: parentID,
        $childID: childID,
    }) !== null;
}

/** Validates that an entity reference uses the correct ID prefix for its type. */
function validateEntityReference(reference: EntityReference): void {
    if ((reference as StoredEntityReference).type === "database") {
        throw new Error(`Database cannot be a child entity: ${reference.id}`);
    }
    if (reference.type === "object" && !reference.id.startsWith(`${ObjectPrefix}_`)) {
        throw new Error(`Invalid object id: ${reference.id}`);
    }
    if (reference.type === "block" && !reference.id.startsWith(`${BlockPrefix}_`)) {
        throw new Error(`Invalid block id: ${reference.id}`);
    }
}

/** Validates that an entity exists and matches the requested type. */
function validateExistingEntity(db: Database, reference: EntityReference): void {
    validateEntityReference(reference);
    const type = getStoredNodeType(db, reference.id);
    if (type === undefined) {
        throw new Error(`Entity not found: ${reference.id}`);
    }
    if (type !== reference.type) {
        throw new Error(`Entity ${reference.id} is a ${type}, not a ${reference.type}`);
    }
}

/** Validates one direct child list for parent/child type rules and duplicates. */
function validateChildBatch(db: Database, parentID: string, children: EntityReference[]): void {
    const childIDs = new Set<string>();
    for (const child of children) {
        validateExistingEntity(db, child);

        if (parentID === child.id) {
            throw new Error(`Entity ${child.id} cannot parent itself`);
        }
        if (parentID.startsWith(`${DatabasePrefix}_`) && child.type === "block") {
            throw new Error(`Database children must be objects: ${child.id}`);
        }
        if (childIDs.has(child.id)) {
            throw new Error(`Duplicate child entity: ${child.id}`);
        }
        childIDs.add(child.id);
    }
}

/** Validates that a database, object, or block parent exists. */
function validateParent(db: Database, parentID: string): void {
    if (parentID.startsWith(`${DatabasePrefix}_`)) {
        validateDatabaseParent(db, parentID);
        return;
    }
    if (!isStoredNode(db, parentID)) {
        throw new Error(`Parent entity not found: ${parentID}`);
    }
}

/** Validates that a database parent exists. */
function validateDatabaseParent(db: Database, databaseID: string): void {
    if (!databaseID.startsWith(`${DatabasePrefix}_`)) {
        throw new Error(`Invalid database id: ${databaseID}`);
    }
    const row = db.query(`
        SELECT nodes.type
        FROM "database"
        JOIN nodes ON nodes.id = "database".id
        WHERE "database".id = $id
    `).get({ $id: databaseID }) as { type: StoredEntityType } | null;

    if (!row) {
        throw new Error(`Database not found: ${databaseID}`);
    }
    if (row.type !== "database") {
        throw new Error(`Entity ${databaseID} is a ${row.type}, not a database`);
    }
}

/** Validates that global containment edges do not contain object/block cycles. */
function validateNoEntityCycles(db: Database): void {
    const rows = db.query(`
        SELECT parent_id AS parentID, child_id AS childID
        FROM edges
    `).all() as { parentID: string; childID: string }[];

    const childrenByParent = new Map<string, string[]>();
    for (const row of rows) {
        if (row.parentID.startsWith(`${DatabasePrefix}_`)) {
            continue;
        }
        const children = childrenByParent.get(row.parentID) ?? [];
        children.push(row.childID);
        childrenByParent.set(row.parentID, children);
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (id: string): void => {
        if (visiting.has(id)) {
            throw new Error(`Entity cycle detected at ${id}`);
        }
        if (visited.has(id)) {
            return;
        }
        visiting.add(id);
        for (const childID of childrenByParent.get(id) ?? []) {
            visit(childID);
        }
        visiting.delete(id);
        visited.add(id);
    };

    for (const parentID of childrenByParent.keys()) {
        visit(parentID);
    }
}

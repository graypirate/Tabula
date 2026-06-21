import type { Database } from "bun:sqlite";

import type { Block, BlockID } from "../../types/block";
import type {
    Entity,
    EntityReference,
} from "../../types/entity";
import type { Obj, ObjID } from "../../types/object";
import { BlockPrefix, DatabasePrefix, ObjectPrefix } from "../../utils/id";
import type { StoredEntityReference, StoredEntityType } from "../types";

type EntityRow = {
    id: string;
    type: StoredEntityType;
    name: string | null;
    objectProperties: string | null;
    content: string | null;
    blockProperties: string | null;
};

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
 * Inserts a base entity row for an object or block subtype.
 * @param db - The database containing the entity
 * @param reference - The entity type and ID to insert
 */
export function insertStoredEntity(db: Database, reference: EntityReference): void {
    validateEntityReference(reference);
    const existingType = getEntityType(db, reference.id);
    if (existingType !== undefined) {
        throw new Error(`Entity already exists: ${reference.id}`);
    }

    db.query(`
        INSERT INTO entities (id, type)
        VALUES ($id, $type)
    `).run({
        $id: reference.id,
        $type: reference.type,
    });
}

/**
 * Inserts a base entity row or validates the existing row has the same type.
 * @param db - The database containing the entity
 * @param reference - The entity type and ID to persist
 */
export function upsertStoredEntity(db: Database, reference: EntityReference): void {
    validateEntityReference(reference);
    const existingType = getEntityType(db, reference.id);
    if (existingType !== undefined) {
        if (existingType !== reference.type) {
            throw new Error(`Entity ${reference.id} is a ${existingType}, not a ${reference.type}`);
        }
        return;
    }

    db.query(`
        INSERT INTO entities (id, type)
        VALUES ($id, $type)
    `).run({
        $id: reference.id,
        $type: reference.type,
    });
}

/**
 * Checks whether a base entity row exists.
 * @param db - The database to check
 * @param id - The entity ID to check
 * @returns True if the entity exists
 */
export function isStoredEntity(db: Database, id: string): boolean {
    return getEntityType(db, id) !== undefined;
}

/**
 * Reads the stored entity type for an ID.
 * @param db - The database containing the entity
 * @param id - The entity ID to read
 * @returns The entity type, or undefined when no entity exists
 */
export function getEntityType(db: Database, id: string): StoredEntityType | undefined {
    const row = db.query(`
        SELECT type
        FROM entities
        WHERE id = $id
    `).get({ $id: id }) as { type: StoredEntityType } | null;

    return row?.type;
}

/**
 * Reads the current direct parent for an object or block.
 * @param db - The database containing the child entity
 * @param childID - The object or block ID whose parent should be read
 * @returns The parent reference, or undefined when the child is unattached
 */
export function getEntityParent(db: Database, childID: string): StoredEntityReference | undefined {
    const childType = getEntityType(db, childID);
    if (childType === undefined) {
        throw new Error(`Entity not found: ${childID}`);
    }
    if (childType === "database") {
        throw new Error(`Database cannot be a child entity: ${childID}`);
    }

    const row = db.query(`
        SELECT
            entity_children.parent_id AS id,
            entities.type
        FROM entity_children
        JOIN entities ON entities.id = entity_children.parent_id
        WHERE entity_children.child_id = $childID
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
            FROM entity_children
            WHERE parent_id = $parentID
        `).get({ $parentID: parentID }) as { maxPosition: number };

        db.query(`
            INSERT INTO entity_children (parent_id, child_id, position)
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
        FROM entity_children
        JOIN entities ON entities.id = entity_children.child_id
        WHERE parent_id = $databaseID
          AND entities.type = 'object'
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
            entities.type,
            position
        FROM entity_children
        JOIN entities ON entities.id = entity_children.child_id
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
 * Reads an object and its recursive containment children.
 * @param db - The database containing the object
 * @param objectID - The object ID to read
 * @returns The recursive public object tree
 */
export function readStoredObjectTree(db: Database, objectID: ObjID): Obj {
    const type = getEntityType(db, objectID);
    if (type === undefined || type !== "object") {
        throw new Error(`Object not found: ${objectID}`);
    }
    const entity = readStoredEntityTree(db, objectID);
    if (entity.type !== "object") {
        throw new Error(`Object not found: ${objectID}`);
    }
    return entity;
}

/**
 * Reads a block and its recursive containment children.
 * @param db - The database containing the block
 * @param blockID - The block ID to read
 * @returns The recursive public block tree
 */
export function readStoredBlockTree(db: Database, blockID: BlockID): Block {
    const type = getEntityType(db, blockID);
    if (type === undefined || type !== "block") {
        throw new Error(`Block not found: ${blockID}`);
    }
    const entity = readStoredEntityTree(db, blockID);
    if (entity.type !== "block") {
        throw new Error(`Block not found: ${blockID}`);
    }
    return entity;
}

/**
 * Reads an entity and recursively hydrates its object/block children.
 * @param db - The database containing the entity
 * @param id - The object or block ID to read
 * @param visited - Entity IDs visited by the current traversal
 * @returns The recursive public entity tree
 */
export function readStoredEntityTree(db: Database, id: string, visited: Set<string> = new Set()): Entity {
    if (visited.has(id)) {
        throw new Error(`Entity cycle detected at ${id}`);
    }
    visited.add(id);

    const row = selectEntityRow(db, id);
    const children = getDirectEntityChildren(db, id).map((child) =>
        readStoredEntityTree(db, child.id, new Set(visited))
    );

    if (row.type === "object") {
        return {
            id: row.id,
            type: "object",
            name: row.name ?? "",
            properties: JSON.parse(row.objectProperties ?? "{}") as Record<string, unknown>,
            children,
        };
    }

    if (row.type !== "block") {
        throw new Error(`Database cannot be read as a public entity: ${id}`);
    }

    return {
        id: row.id,
        type: "block",
        content: row.content ?? "",
        properties: JSON.parse(row.blockProperties ?? "{}") as Record<string, unknown>,
        children,
    };
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
                DELETE FROM entity_children
                WHERE parent_id = $parentID
            `).run({ $parentID: parentID });
        }

        const insert = db.query(`
            INSERT INTO entity_children (parent_id, child_id, position)
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
 * Deletes one entity and its recursive containment subtree.
 * @param db - The database containing the entity
 * @param id - The object or block ID to delete
 * @returns True if the entity existed and was deleted
 */
export function deleteStoredEntitySubtree(db: Database, id: string): boolean {
    return deleteStoredEntitySubtrees(db, [id]) > 0;
}

/**
 * Deletes entities and their recursive containment subtrees.
 * @param db - The database containing the entities
 * @param ids - The object or block IDs to delete
 * @returns The number of requested IDs that existed
 */
export function deleteStoredEntitySubtrees(db: Database, ids: string[]): number {
    const uniqueIDs = [...new Set(ids)];
    if (uniqueIDs.length === 0) {
        return 0;
    }

    const existingIDs: string[] = [];
    for (const id of uniqueIDs) {
        const type = getEntityType(db, id);
        if (type === undefined) {
            continue;
        }
        if (type === "database") {
            throw new Error(`Database cannot be deleted as a public entity: ${id}`);
        }
        existingIDs.push(id);
    }

    if (existingIDs.length === 0) {
        return 0;
    }

    const childRows = db.query(`
        SELECT child_id AS id
        FROM entity_children
        WHERE parent_id IN (SELECT value FROM json_each($ids))
    `).all({ $ids: JSON.stringify(existingIDs) }) as { id: string }[];

    db.query(`
        DELETE FROM entity_children
        WHERE parent_id IN (SELECT value FROM json_each($ids))
           OR child_id IN (SELECT value FROM json_each($ids))
    `).run({ $ids: JSON.stringify(existingIDs) });

    db.query(`
        DELETE FROM entities
        WHERE id IN (SELECT value FROM json_each($ids))
    `).run({ $ids: JSON.stringify(existingIDs) });

    deleteUnreferencedEntitySubtrees(db, childRows.map((row) => row.id));

    return existingIDs.length;
}

/** Reads the joined base/subtype row for an entity ID. */
function selectEntityRow(db: Database, id: string): EntityRow {
    const row = db.query(`
        SELECT
            entities.id,
            entities.type,
            objects.name,
            objects.properties AS objectProperties,
            blocks.content,
            blocks.properties AS blockProperties
        FROM entities
        LEFT JOIN objects ON objects.id = entities.id
        LEFT JOIN blocks ON blocks.id = entities.id
        WHERE entities.id = $id
    `).get({ $id: id }) as EntityRow | null;

    if (!row) {
        throw new Error(`Entity not found: ${id}`);
    }
    return row;
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
    const type = getEntityType(db, reference.id);
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
    if (!isStoredEntity(db, parentID)) {
        throw new Error(`Parent entity not found: ${parentID}`);
    }
}

/** Validates that a database parent exists. */
function validateDatabaseParent(db: Database, databaseID: string): void {
    if (!databaseID.startsWith(`${DatabasePrefix}_`)) {
        throw new Error(`Invalid database id: ${databaseID}`);
    }
    const row = db.query(`
        SELECT entities.type
        FROM "database"
        JOIN entities ON entities.id = "database".id
        WHERE "database".id = $id
    `).get({ $id: databaseID }) as { type: StoredEntityType } | null;

    if (!row) {
        throw new Error(`Database not found: ${databaseID}`);
    }
    if (row.type !== "database") {
        throw new Error(`Entity ${databaseID} is a ${row.type}, not a database`);
    }
}

/** Checks whether a direct parent/child edge already exists. */
function hasEntityChild(db: Database, parentID: string, childID: string): boolean {
    return db.query(`
        SELECT 1
        FROM entity_children
        WHERE parent_id = $parentID
          AND child_id = $childID
    `).get({
        $parentID: parentID,
        $childID: childID,
    }) !== null;
}

/** Removes the current parent edge for a child so it can be reparented or detached. */
export function detachEntityParent(db: Database, childID: string): void {
    db.query(`
        DELETE FROM entity_children
        WHERE child_id = $childID
    `).run({ $childID: childID });
}

/** Deletes entity subtrees that no remaining parent references. */
function deleteUnreferencedEntitySubtrees(db: Database, roots: string[]): void {
    const pending = [...roots];
    const deleted = new Set<string>();

    for (let index = 0; index < pending.length; index += 1) {
        const id = pending[index]!;
        if (deleted.has(id) || hasEntityParent(db, id)) {
            continue;
        }
        deleted.add(id);

        const rows = db.query(`
            SELECT child_id AS id
            FROM entity_children
            WHERE parent_id = $id
        `).all({ $id: id }) as { id: string }[];

        db.query(`
            DELETE FROM entity_children
            WHERE parent_id = $id
               OR child_id = $id
        `).run({ $id: id });

        pending.push(...rows.map((row) => row.id));
    }

    if (deleted.size === 0) {
        return;
    }

    db.query(`
        DELETE FROM entities
        WHERE id IN (SELECT value FROM json_each($ids))
    `).run({ $ids: JSON.stringify([...deleted]) });
}

/** Checks whether any parent edge references an entity. */
function hasEntityParent(db: Database, id: string): boolean {
    return db.query(`
        SELECT 1
        FROM entity_children
        WHERE child_id = $id
    `).get({ $id: id }) !== null;
}

/** Validates that global containment edges do not contain object/block cycles. */
function validateNoEntityCycles(db: Database): void {
    const rows = db.query(`
        SELECT parent_id AS parentID, child_id AS childID
        FROM entity_children
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

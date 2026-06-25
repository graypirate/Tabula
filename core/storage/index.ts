import type { Database } from "bun:sqlite";

import type { Block, BlockID, BlockMetadata } from "../types/block";
import type { DBMetadata } from "../types/database";
import type { Entity, EntityID, EntityReference } from "../types/graph";
import type { Obj, ObjID, ObjMetadata } from "../types/object";
import {
    getBlockMetadata,
    getStoredBlock,
    insertStoredBlock,
    isStoredBlock,
    upsertStoredBlock,
} from "./db/blocks";
import {
    appendEntityChild,
    appendDatabaseRootObject,
    getDatabaseRootObjects,
    getDirectEntityChildren,
    getDirectEntityChildIDs,
    getEntityParent,
    replaceEntityChildren,
} from "./db/edges";
import {
    getDatabaseMetadata,
    initDatabase,
    openDatabase as openStoredDatabase,
} from "./db/init";
import {
    deleteStoredNodes,
    getStoredNodeType,
    insertStoredNode,
    isStoredNode,
    upsertStoredNode,
} from "./db/nodes";
import {
    getObjectMetadata,
    getStoredObject,
    insertStoredObject,
    isStoredObject,
    upsertStoredObject,
} from "./db/objects";
import type {
    StoredBlock,
    StoredEntity,
    StoredEntityID,
    StoredEntityReference,
    StoredObject,
} from "./types";

export type {
    StoredBlock,
    StoredEntity,
    StoredEntityID,
    StoredEntityReference,
    StoredEntityType,
    StoredObject,
} from "./types";

export type SearchType = "object" | "block";

export interface SearchResult {
    type: SearchType;
    id: string;
    label: string;
}

type SearchRow = SearchResult;

// DB functionality

export function initializeStorage(path: string, name?: string): Database {
    return initDatabase(path, name);
}

export function openStorage(path: string): Database {
    return openStoredDatabase(path);
}

export function readDatabaseMetadata(db: Database): DBMetadata {
    return getDatabaseMetadata(db);
}

// Creation and existence

/**
 * Create an entity with parent placement.
 *
 * Objects: parentID defaults to database root if unspecified.
 * Blocks require an explicit object or block parent.
 * @param db
 * @param entity
 * @param parentID
 */
export function createEntity(
    db: Database,
    entity: StoredEntity,
    parentID?: StoredEntityID,
): void {
    const create = db.transaction(() => {
        insertStoredNode(db, {
            type: entity.type,
            id: entity.id,
        });

        if (entity.type === "object") {
            insertStoredObject(db, entity);
        } else {
            insertStoredBlock(db, entity);
        }

        appendEntityChild(db, resolveRootParentID(db, entity.type, parentID), {
            type: entity.type,
            id: entity.id,
        });
    });

    create();
}

export function objectExists(db: Database, objectID: ObjID): boolean {
    return isStoredObject(db, objectID);
}

export function blockExists(db: Database, blockID: BlockID): boolean {
    return isStoredBlock(db, blockID);
}

export function entityExists(db: Database, id: string): boolean {
    return isStoredNode(db, id);
}

// Read

export function readObjectTree(db: Database, objectID: ObjID): Obj {
    const type = getStoredNodeType(db, objectID);
    if (type === undefined || type !== "object") {
        throw new Error(`Object not found: ${objectID}`);
    }
    const entity = readEntityTree(db, objectID);
    if (entity.type !== "object") {
        throw new Error(`Object not found: ${objectID}`);
    }
    return entity;
}

export function readBlockTree(db: Database, blockID: BlockID): Block {
    const type = getStoredNodeType(db, blockID);
    if (type === undefined || type !== "block") {
        throw new Error(`Block not found: ${blockID}`);
    }
    const entity = readEntityTree(db, blockID);
    if (entity.type !== "block") {
        throw new Error(`Block not found: ${blockID}`);
    }
    return entity;
}

export function readEntityTree(db: Database, entityID: string, visited: Set<string> = new Set()): Entity {
    if (visited.has(entityID)) {
        throw new Error(`Entity cycle detected at ${entityID}`);
    }
    visited.add(entityID);

    const type = getStoredNodeType(db, entityID);
    if (type === undefined) {
        throw new Error(`Entity not found: ${entityID}`);
    }
    if (type === "database") {
        throw new Error(`Database cannot be read as a public entity: ${entityID}`);
    }

    const children = getDirectEntityChildren(db, entityID).map((child) =>
        readEntityTree(db, child.id, new Set(visited))
    );

    if (type === "object") {
        return {
            ...getStoredObject(db, entityID),
            children,
        };
    }

    return {
        ...getStoredBlock(db, entityID),
        children,
    };
}

export function readDatabaseRootObjects(db: Database): ObjID[] {
    return getDatabaseRootObjects(db, getDatabaseMetadata(db).id);
}

export function readObjectMetadata(db: Database, objectID: ObjID): ObjMetadata {
    return getObjectMetadata(db, objectID);
}

export function readBlockMetadata(db: Database, blockID: BlockID): BlockMetadata {
    return getBlockMetadata(db, blockID);
}

export function readDirectEntityChildIDs(db: Database, parentID: string): StoredEntityID[] {
    return getDirectEntityChildIDs(db, parentID) as StoredEntityID[];
}

export function readEntityParent(
    db: Database,
    entityID: string,
): StoredEntityReference | undefined {
    return getEntityParent(db, entityID);
}

export function readEntityParentID(db: Database, entityID: string): StoredEntityID | null {
    return readEntityParent(db, entityID)?.id ?? null;
}

// Insert and write

export function persistEntityTree(db: Database, root: Entity): void {
    const visit = (entity: Entity): void => {
        upsertStoredNode(db, {
            type: entity.type,
            id: entity.id,
        });

        if (entity.type === "object") {
            upsertStoredObject(db, {
                id: entity.id,
                type: "object",
                name: entity.name,
                properties: entity.properties ?? {},
            });
        } else {
            upsertStoredBlock(db, {
                id: entity.id,
                type: "block",
                content: entity.content,
                properties: entity.properties ?? {},
            });
        }

        entity.children.forEach(visit);
    };

    visit(root);
}

export function writeEntityTree(
    db: Database,
    root: Entity,
    parentID?: StoredEntityID,
): Entity {
    const write = db.transaction(() => {
        persistEntityTree(db, root);
        appendEntityChild(db, resolveRootParentID(db, root.type, parentID), {
            type: root.type,
            id: root.id,
        });

        const desiredChildrenByParent = buildChildMap(root);
        const submittedIDs = collectSubmittedEntityIDs(root);
        const omittedChildIDs = collectOmittedChildIDs(db, desiredChildrenByParent, submittedIDs);
        replaceEntityChildren(db, desiredChildrenByParent);
        deleteOmittedEntitySubtrees(db, omittedChildIDs);
    });

    write();
    return readEntityTree(db, root.id);
}

export function moveObjectToDatabaseRoot(db: Database, objectID: ObjID): void {
    appendDatabaseRootObject(db, getDatabaseMetadata(db).id, objectID);
}

export function attachEntityChild(
    db: Database,
    parentID: StoredEntityID,
    child: EntityReference,
): void {
    appendEntityChild(db, parentID, child);
}

export function replaceDirectEntityChildren(
    db: Database,
    desiredChildrenByParent: Map<string, EntityReference[]>,
): void {
    replaceEntityChildren(db, desiredChildrenByParent);
}

// Deletion

export function deleteObjectTree(db: Database, objectID: ObjID): boolean {
    const type = getStoredNodeType(db, objectID);
    if (type === undefined) {
        return false;
    }
    if (type !== "object") {
        throw new Error(`Object not found: ${objectID}`);
    }
    return deleteEntityTree(db, objectID);
}

export function deleteBlockTree(db: Database, blockID: BlockID): boolean {
    const type = getStoredNodeType(db, blockID);
    if (type === undefined) {
        return false;
    }
    if (type !== "block") {
        throw new Error(`Block not found: ${blockID}`);
    }
    return deleteEntityTree(db, blockID);
}

export function deleteEntityTree(db: Database, entityID: string): boolean {
    const type = getStoredNodeType(db, entityID);
    if (type === undefined) {
        return false;
    }
    if (type === "database") {
        throw new Error(`Database cannot be deleted as a public entity: ${entityID}`);
    }
    const ids = collectEntitySubtreeIDs(db, entityID);
    deleteStoredNodes(db, ids);
    return true;
}

// Search functionality

export function searchEntities(
    db: Database,
    query: string,
    type?: SearchType,
): SearchResult[] {
    const types: SearchType[] = type === undefined
        ? ["object", "block"]
        : [type];
    const rows: SearchRow[] = [];
    const parameters = { $query: query };

    if (types.includes("object")) {
        rows.push(...db.query(`
            SELECT 'object' AS type, id, name AS label
            FROM objects
            WHERE instr(lower(name), lower($query)) > 0
               OR instr(lower(properties), lower($query)) > 0
        `).all(parameters) as SearchRow[]);
    }
    if (types.includes("block")) {
        rows.push(...db.query(`
            SELECT 'block' AS type, id, content AS label
            FROM blocks
            WHERE instr(lower(content), lower($query)) > 0
               OR instr(lower(properties), lower($query)) > 0
        `).all(parameters) as SearchRow[]);
    }

    return rows
        .map((row) => ({
            ...row,
            label: row.type === "block" ? blockLabel(row.label) : row.label,
        }))
        .sort((left, right) =>
            left.type.localeCompare(right.type)
            || left.label.localeCompare(right.label)
            || left.id.localeCompare(right.id)
        );
}

/** Converts block content into a compact single-line search label. */
function blockLabel(content: string): string {
    const normalized = content.replace(/\s+/g, " ").trim();
    return normalized.length <= 80 ? normalized : `${normalized.slice(0, 77)}...`;
}

/** Builds complete direct-child replacement lists for every entity in a tree. */
function buildChildMap(root: Entity): Map<string, EntityReference[]> {
    const map = new Map<string, EntityReference[]>();

    const visit = (entity: Entity): void => {
        map.set(entity.id, entity.children.map((child) => ({
            type: child.type,
            id: child.id,
        })));
        entity.children.forEach(visit);
    };

    visit(root);
    return map;
}

/** Resolves public root placement. */
function resolveRootParentID(
    db: Database,
    type: Entity["type"],
    parentID?: StoredEntityID,
): StoredEntityID {
    if (parentID !== undefined) {
        return parentID;
    }
    if (type === "object") {
        return getDatabaseMetadata(db).id;
    }
    throw new Error("Block parent is required");
}

/** Collects every entity ID explicitly present in a submitted tree. */
function collectSubmittedEntityIDs(root: Entity): Set<EntityID> {
    const ids = new Set<EntityID>();

    const visit = (entity: Entity): void => {
        ids.add(entity.id);
        entity.children.forEach(visit);
    };

    visit(root);
    return ids;
}

/** Finds existing direct children that a replacement write omitted. */
function collectOmittedChildIDs(
    db: Database,
    desiredChildrenByParent: Map<string, EntityReference[]>,
    submittedIDs: Set<EntityID>,
): EntityID[] {
    const omitted = new Set<EntityID>();

    for (const [parentID, desiredChildren] of desiredChildrenByParent) {
        const desiredChildIDs = new Set(desiredChildren.map((child) => child.id));
        for (const child of getDirectEntityChildren(db, parentID)) {
            if (!desiredChildIDs.has(child.id) && !submittedIDs.has(child.id)) {
                omitted.add(child.id);
            }
        }
    }

    return [...omitted];
}

/** Deletes omitted children after moved descendants have been reparented. */
function deleteOmittedEntitySubtrees(db: Database, rootIDs: EntityID[]): void {
    const deleted = new Set<string>();
    for (const rootID of rootIDs) {
        if (deleted.has(rootID) || getStoredNodeType(db, rootID) === undefined) {
            continue;
        }
        const ids = collectEntitySubtreeIDs(db, rootID);
        deleteStoredNodes(db, ids);
        ids.forEach((id) => deleted.add(id));
    }
}

/** Collects one entity and all of its recursive containment descendants. */
function collectEntitySubtreeIDs(db: Database, rootID: string): string[] {
    const ids: string[] = [];
    const visited = new Set<string>();

    const visit = (id: string): void => {
        if (visited.has(id)) {
            throw new Error(`Entity cycle detected at ${id}`);
        }
        visited.add(id);
        ids.push(id);
        for (const child of getDirectEntityChildren(db, id)) {
            visit(child.id);
        }
    };

    visit(rootID);
    return ids;
}

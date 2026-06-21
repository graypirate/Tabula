import type { Database } from "bun:sqlite";

import type { Block, BlockID, BlockMetadata } from "../types/block";
import type { DBMetadata } from "../types/database";
import type { Entity, EntityReference } from "../types/entity";
import type { Obj, ObjID, ObjMetadata } from "../types/object";
import {
    deleteStoredBlock,
    getBlockMetadata,
    insertStoredBlock,
    isStoredBlock,
    upsertStoredBlock,
} from "./db/blocks";
import {
    appendEntityChild,
    appendDatabaseRootObject,
    deleteStoredEntitySubtree,
    detachEntityParent,
    getDatabaseRootObjects,
    getDirectEntityChildren,
    getEntityParent,
    getEntityType,
    isStoredEntity,
    readStoredEntityTree,
    readStoredBlockTree,
    readStoredObjectTree,
    replaceEntityChildren,
} from "./db/entities";
import {
    getDatabaseMetadata,
    initDatabase,
    openDatabase as openStoredDatabase,
} from "./db/init";
import {
    deleteStoredObject,
    getObjectMetadata,
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

export interface EntityList {
    metadata: ObjMetadata | BlockMetadata;
    parentID: StoredEntityID | null;
    children: EntityReference[];
}

type SearchRow = SearchResult;

export function initializeDatabaseStorage(path: string, name?: string): Database {
    return initDatabase(path, name);
}

export function openDatabaseStorage(path: string): Database {
    return openStoredDatabase(path);
}

export function readDatabaseMetadata(db: Database): DBMetadata {
    return getDatabaseMetadata(db);
}

export function createEntity(
    db: Database,
    entity: StoredEntity,
    parentID?: StoredEntityID,
): void {
    const create = db.transaction(() => {
        if (entity.type === "object") {
            insertStoredObject(db, entity);
        } else {
            insertStoredBlock(db, entity);
        }

        const desiredParentID = parentID
            ?? (entity.type === "object" ? getDatabaseMetadata(db).id : undefined);

        if (desiredParentID !== undefined) {
            appendEntityChild(db, desiredParentID, {
                type: entity.type,
                id: entity.id,
            });
        }
    });

    create();
}

export function createRootObject(db: Database, object: StoredObject): void {
    createEntity(db, object, getDatabaseMetadata(db).id);
}

export function createStandaloneBlock(db: Database, block: StoredBlock): void {
    createEntity(db, block);
}

export function objectExists(db: Database, objectID: ObjID): boolean {
    return isStoredObject(db, objectID);
}

export function blockExists(db: Database, blockID: BlockID): boolean {
    return isStoredBlock(db, blockID);
}

export function entityExists(db: Database, id: string): boolean {
    return isStoredEntity(db, id);
}

export function readObjectTree(db: Database, objectID: ObjID): Obj {
    return readStoredObjectTree(db, objectID);
}

export function readBlockTree(db: Database, blockID: BlockID): Block {
    return readStoredBlockTree(db, blockID);
}

export function readEntityTree(db: Database, entityID: string): Entity {
    return readStoredEntityTree(db, entityID);
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

export function readDirectEntityChildren(db: Database, parentID: string): EntityReference[] {
    return getDirectEntityChildren(db, parentID);
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

export function listEntity(db: Database, entityID: string): EntityList {
    const type = getEntityType(db, entityID);
    if (type === undefined) {
        throw new Error(`Entity not found: ${entityID}`);
    }
    if (type === "database") {
        throw new Error(`Database cannot be listed as a public entity: ${entityID}`);
    }

    return {
        metadata: type === "object"
            ? getObjectMetadata(db, entityID)
            : getBlockMetadata(db, entityID),
        parentID: readEntityParentID(db, entityID),
        children: getDirectEntityChildren(db, entityID),
    };
}

export function persistEntityTree(db: Database, root: Entity): void {
    const visit = (entity: Entity): void => {
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
        const desiredParentID = parentID
            ?? (root.type === "object" ? getDatabaseMetadata(db).id : undefined);

        if (desiredParentID !== undefined) {
            appendEntityChild(db, desiredParentID, {
                type: root.type,
                id: root.id,
            });
        } else {
            detachEntityParent(db, root.id);
        }
        replaceEntityChildren(db, buildChildMap(root));
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

export function deleteObjectTree(db: Database, objectID: ObjID): boolean {
    return deleteStoredObject(db, objectID);
}

export function deleteBlockTree(db: Database, blockID: BlockID): boolean {
    return deleteStoredBlock(db, blockID);
}

export function deleteEntityTree(db: Database, entityID: string): boolean {
    const type = getEntityType(db, entityID);
    if (type === undefined) {
        return false;
    }
    if (type === "database") {
        throw new Error(`Database cannot be deleted as a public entity: ${entityID}`);
    }
    return deleteStoredEntitySubtree(db, entityID);
}

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

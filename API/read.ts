import type { Database } from "bun:sqlite";

import {
    readDatabaseMetadata,
    readDatabaseRootObjects,
    listEntity as listStoredEntity,
    readEntityParentID,
    readEntityTree,
} from "../core/storage";
import type { Block, BlockID, BlockMetadata } from "../core/types/block";
import type { DBMetadata } from "../core/types/database";
import type { Entity } from "../core/types/entity";
import type { Obj, ObjID, ObjMetadata } from "../core/types/object";
import {
    type BlockList,
    type BlockResult,
    type EntityList,
    type EntityResult,
    type ObjectList,
    type ObjectResult,
} from "./types";

export interface DatabaseList {
    parentID: null;
    metadata: DBMetadata;
    objects: ObjID[];
}

/**
 * Reads database metadata.
 * @param db - The database to read
 * @returns The database metadata
 */
export function readDatabase(db: Database): DBMetadata {
    return readDatabaseMetadata(db);
}

/**
 * Reads an object or block as a parent-aware recursive entity result.
 * @param db - The database containing the entity
 * @param entityID - The object or block ID to read
 * @returns The parent-aware recursive entity result
 */
export function readEntity(db: Database, entityID: string): EntityResult {
    return entityResult(db, readEntityTree(db, entityID));
}

/**
 * Reads an object as a recursive entity tree.
 * @param db - The database containing the object
 * @param objectID - The object ID to read
 * @returns The recursive object
 */
export function readObject(db: Database, objectID: ObjID): ObjectResult {
    const result = readEntity(db, objectID);
    assertObjectResult(result);
    return result;
}

/**
 * Reads a block as a recursive entity tree.
 * @param db - The database containing the block
 * @param blockID - The block ID to read
 * @returns The recursive block
 */
export function readBlock(db: Database, blockID: BlockID): BlockResult {
    const result = readEntity(db, blockID);
    assertBlockResult(result);
    return result;
}

/**
 * Lists database metadata and root object IDs.
 * @param db - The database to list
 * @returns The database list view
 */
export function listDatabase(db: Database): DatabaseList {
    const metadata = readDatabaseMetadata(db);
    return {
        parentID: null,
        metadata,
        objects: readDatabaseRootObjects(db),
    };
}

/**
 * Lists object or block metadata and direct child entity references.
 * @param db - The database containing the entity
 * @param entityID - The object or block ID to list
 * @returns The parent-aware entity list view
 */
export function listEntity(db: Database, entityID: string): EntityList {
    const result = listStoredEntity(db, entityID);
    return {
        parentID: result.parentID,
        metadata: result.metadata,
        children: result.children,
    };
}

/**
 * Lists object metadata and direct child entity references.
 * @param db - The database containing the object
 * @param objectID - The object ID to list
 * @returns The object list view
 */
export function listObject(db: Database, objectID: ObjID): ObjectList {
    const result = listEntity(db, objectID);
    assertObjectList(result);
    return result;
}

/**
 * Lists block metadata and direct child entity references.
 * @param db - The database containing the block
 * @param blockID - The block ID to list
 * @returns The block list view
 */
export function listBlock(db: Database, blockID: BlockID): BlockList {
    const result = listEntity(db, blockID);
    assertBlockList(result);
    return result;
}

function entityResult<T extends Entity>(db: Database, entity: T): EntityResult<T> {
    return {
        parentID: readEntityParentID(db, entity.id),
        entity,
    };
}

function assertObjectResult(result: EntityResult): asserts result is ObjectResult {
    if (result.entity.type !== "object") {
        throw new Error("Expected object result");
    }
}

function assertBlockResult(result: EntityResult): asserts result is BlockResult {
    if (result.entity.type !== "block") {
        throw new Error("Expected block result");
    }
}

function assertObjectList(result: EntityList): asserts result is ObjectList {
    if (result.metadata.type !== "object") {
        throw new Error("Expected object list");
    }
}

function assertBlockList(result: EntityList): asserts result is BlockList {
    if (result.metadata.type !== "block") {
        throw new Error("Expected block list");
    }
}

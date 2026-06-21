import type { Database } from "bun:sqlite";

import {
    readDatabaseRootObjects,
    readDirectEntityChildIDs,
    readDatabaseMetadata,
    readEntityParentID,
    readEntityTree,
} from "../core/storage";
import type { Block, BlockID } from "../core/types/block";
import type { DBMetadata } from "../core/types/database";
import type { Entity, EntityID } from "../core/types/graph";
import type { Obj, ObjID } from "../core/types/object";
import { type BlockResult, type Result, type ObjectResult } from "./types";

// Read functions

/**
 * Reads an object or block as a parent-aware recursive entity result.
 * @param db - The database containing the entity
 * @param id - The object or block ID to read
 * @returns The parent-aware recursive entity result
 */
export function readEntity(db: Database, id: string): Result {
    return entityResult(db, readEntityTree(db, id));
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

// List functions

/**
 * Lists the database shape as ordered root object IDs.
 * @param db - The database to list
 * @returns The ordered root object IDs
 */
export function listDatabase(db: Database): ObjID[] {
    return readDatabaseRootObjects(db);
}

/**
 * Lists the direct child IDs for an object or block.
 * @param db - The database containing the entity
 * @param entityID - The object or block ID to list
 * @returns The ordered direct child IDs
 */
export function listEntity(db: Database, entityID: EntityID): EntityID[] {
    return readDirectEntityChildIDs(db, entityID);
}

/**
 * Lists direct child IDs for an object.
 * @param db - The database containing the object
 * @param objectID - The object ID to list
 * @returns The ordered direct child IDs
 */
export function listObject(db: Database, objectID: ObjID): EntityID[] {
    return listEntity(db, objectID);
}

/**
 * Lists direct child IDs for a block.
 * @param db - The database containing the block
 * @param blockID - The block ID to list
 * @returns The ordered direct child IDs
 */
export function listBlock(db: Database, blockID: BlockID): EntityID[] {
    return listEntity(db, blockID);
}

// Internal helpers

function entityResult<T extends Entity>(db: Database, entity: T): Result<T> {
    return {
        parentID: readEntityParentID(db, entity.id),
        entity,
    };
}

function assertObjectResult(result: Result): asserts result is ObjectResult {
    if (result.entity.type !== "object") {
        throw new Error("Expected object result");
    }
}

function assertBlockResult(result: Result): asserts result is BlockResult {
    if (result.entity.type !== "block") {
        throw new Error("Expected block result");
    }
}

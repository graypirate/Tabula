import type { Database } from "bun:sqlite";

import { deleteEntityTree } from "../core/storage";
import type { BlockID } from "../core/types/block";
import type { ObjID } from "../core/types/object";

/**
 * Deletes an object or block and its recursive containment subtree.
 * @param db - The database containing the entity
 * @param entityID - The object or block ID to delete
 * @returns True if the entity existed and was deleted
 */
export function deleteEntity(db: Database, entityID: string): boolean {
    return deleteEntityTree(db, entityID);
}

/**
 * Deletes an object and its recursive containment subtree.
 * @param db - The database containing the object
 * @param objectID - The object ID to delete
 * @returns True if the object existed and was deleted
 */
export function deleteObject(db: Database, objectID: ObjID): boolean {
    return deleteEntity(db, objectID);
}

/**
 * Deletes a block and its recursive containment subtree.
 * @param db - The database containing the block
 * @param blockID - The block ID to delete
 * @returns True if the block existed and was deleted
 */
export function deleteBlock(db: Database, blockID: BlockID): boolean {
    return deleteEntity(db, blockID);
}

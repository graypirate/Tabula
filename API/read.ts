import type { Database } from "bun:sqlite";

import { getBlockMetadata, getBlockPlacements, getStoredBlock } from "../core/db/blocks";
import { getDatabaseMetadata } from "../core/db/init";
import { getObjectMetadata, getStoredObject } from "../core/db/objects";
import { getSilo } from "../core/db/silos";
import type { Block, BlockID, BlockMetadata } from "../core/types/block";
import type { DBMetadata, DatabaseID } from "../core/types/database";
import type { Obj, ObjID, ObjMetadata } from "../core/types/object";
import type { SiloID, SiloMetadata } from "../core/types/silo";
import { expandStoredObject } from "./types";

// MARK: List interfaces

export interface DatabaseList {
    metadata: DBMetadata;
    silos: SiloID[];
    objects: ObjID[];
}

export interface SiloList {
    metadata: SiloMetadata;
    silos: SiloID[];
    objects: ObjID[];
}

export interface ObjectList {
    metadata: ObjMetadata;
    blocks: BlockID[];
}

export interface BlockList {
    metadata: BlockMetadata;
    objectID?: ObjID;
    ancestors?: BlockID[];
    children?: BlockID[];
}

// MARK: Read functions return a full physical entity

export function readDatabase(db: Database): DBMetadata {
    return getDatabaseMetadata(db);
}

export function readSilo(db: Database, siloID: SiloID): SiloMetadata {
    return getSilo(db, siloID);
}

export function readObject(db: Database, objectID: ObjID): Obj {
    return expandStoredObject(getStoredObject(db, objectID));
}

export function readBlock(db: Database, blockID: BlockID): Block {
    return getStoredBlock(db, blockID);
}

// MARK: List functions return a high-level view of the entity

export function listDatabase(db: Database): DatabaseList {
    const metadata = getDatabaseMetadata(db);
    return {
        metadata,
        ...readContainerChildren(db, metadata.id),
    };
}

export function listSilo(db: Database, siloID: SiloID): SiloList {
    return {
        metadata: getSilo(db, siloID),
        ...readContainerChildren(db, siloID),
    };
}

export function listObject(db: Database, objectID: ObjID): ObjectList {
    const rows = db.query(`
        SELECT block_id AS id
        FROM object_blocks
        WHERE object_id = $objectID
          AND parent_block_id IS NULL
        ORDER BY position
    `).all({ $objectID: objectID }) as { id: BlockID }[];

    return {
        metadata: getObjectMetadata(db, objectID),
        blocks: rows.map((row) => row.id),
    };
}

/* Listing a block can refer to the canonical entity or its placement within an object */
export function listBlock(
    db: Database,
    blockID: BlockID,
    objectID?: ObjID,
): BlockList {
    const result: BlockList = {
        metadata: getBlockMetadata(db, blockID),
    };
    if (objectID === undefined) {
        return result;
    }

    const blocks = getBlockPlacements(db, objectID);
    const byID = new Map(blocks.map((block) => [block.id, block]));
    const target = byID.get(blockID);
    if (!target) {
        throw new Error(`Block ${blockID} is not placed in object ${objectID}`);
    }

    const ancestors: BlockID[] = [];
    let parentID = target.parentBlockID;
    while (parentID !== undefined) {
        ancestors.push(parentID);
        parentID = byID.get(parentID)?.parentBlockID;
    }
    ancestors.reverse();

    return {
        ...result,
        objectID,
        ancestors,
        children: blocks
            .filter((block) => block.parentBlockID === blockID)
            .map((block) => block.id),
    };
}

// MARK: Helper functions

/** Reads the direct silo and object children of a database or silo. */
function readContainerChildren(
    db: Database,
    parentID: DatabaseID | SiloID,
): { silos: SiloID[]; objects: ObjID[] } {
    const silos = db.query(`
        SELECT id
        FROM silos
        WHERE parent_id = $parentID
        ORDER BY name, id
    `).all({ $parentID: parentID }) as { id: SiloID }[];
    const objects = db.query(`
        SELECT id
        FROM objects
        WHERE parent_id = $parentID
        ORDER BY name, id
    `).all({ $parentID: parentID }) as { id: ObjID }[];

    return {
        silos: silos.map((row) => row.id),
        objects: objects.map((row) => row.id),
    };
}

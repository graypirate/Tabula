import type { Database } from "bun:sqlite";

import {
    insertStoredBlock,
    isStoredBlock,
    syncBlockPlacements,
    updateStoredBlock,
} from "../core/db/blocks";
import {
    insertStoredObject,
    isStoredObject,
    updateStoredObject,
} from "../core/db/objects";
import type { StoredObject } from "../core/db/types";
import type { Block, BlockID, ObjectBlock } from "../core/types/block";
import type { Obj, ObjID } from "../core/types/object";
import { createBlockID, createObjID } from "../core/utils/id";
import { flattenObjectBlocks } from "./types";

export type BlockWrite = Omit<Block, "id"> & {
    id?: BlockID;
};

export type ObjectBlockWrite = Omit<ObjectBlock, "id" | "children"> & {
    id?: BlockID;
    children: ObjectBlockWrite[];
};

export type ObjectWrite = Omit<Obj, "id" | "blocks"> & {
    id?: ObjID;
    blocks: ObjectBlockWrite[];
};

export function writeBlock(db: Database, input: BlockWrite): Block {
    const block: Block = {
        id: input.id ?? createAvailableBlockID(db),
        content: input.content,
        properties: input.properties ?? {},
    };

    if (input.id === undefined) {
        insertStoredBlock(db, block);
    } else {
        updateStoredBlock(db, block);
    }

    return block;
}

export function writeObject(db: Database, input: ObjectWrite): Obj {
    const objectID = input.id ?? createAvailableObjectID(db);
    const blocks = prepareBlocks(db, input.blocks);
    const placements = flattenObjectBlocks(blocks);
    const storedObject: StoredObject = {
        id: objectID,
        parentID: input.parentID,
        name: input.name,
        properties: input.properties ?? {},
        blocks: placements,
    };

    const write = db.transaction(() => {
        if (input.id === undefined) {
            insertStoredObject(db, storedObject);
            syncBlockPlacements(db, objectID, placements);
        } else {
            updateStoredObject(db, storedObject);
        }
    });

    write();
    return {
        id: objectID,
        parentID: input.parentID,
        name: input.name,
        properties: input.properties ?? {},
        blocks,
    };
}

/** Assigns IDs while producing public object blocks. */
function prepareBlocks(
    db: Database,
    roots: ObjectBlockWrite[],
): ObjectBlock[] {
    const usedIDs = new Set<BlockID>();

    const visit = (
        children: ObjectBlockWrite[],
    ): ObjectBlock[] =>
        children.map((input) => {
            const id = input.id ?? createAvailableBlockID(db, usedIDs);
            if (usedIDs.has(id)) {
                throw new Error(`Duplicate block ID in object: ${id}`);
            }
            if (input.id !== undefined && !isStoredBlock(db, id)) {
                throw new Error(`Block not found: ${id}`);
            }

            usedIDs.add(id);
            return {
                id,
                content: input.content,
                properties: input.properties ?? {},
                children: visit(input.children),
            };
        });

    return visit(roots);
}

/** Generates an object ID that is not already stored. */
function createAvailableObjectID(db: Database): ObjID {
    let id = createObjID();
    while (isStoredObject(db, id)) {
        id = createObjID();
    }
    return id;
}

/** Generates a block ID that is neither stored nor reserved by the current write. */
function createAvailableBlockID(db: Database, reserved: Set<BlockID> = new Set()): BlockID {
    let id = createBlockID();
    while (reserved.has(id) || isStoredBlock(db, id)) {
        id = createBlockID();
    }
    return id;
}

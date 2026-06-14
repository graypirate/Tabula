import type { Database } from "bun:sqlite";

import {
    insertBlock,
    isBlock,
    syncObjectBlocks,
    updateBlock,
} from "../core/db/blocks";
import { insertObject, isObject, updateObject } from "../core/db/objects";
import type { Block, BlockID, ObjectBlock } from "../core/types/block";
import type { Obj, ObjID } from "../core/types/object";
import { createBlockID, createObjID } from "../core/utils/id";

export type BlockWrite = Omit<Block, "id"> & {
    id?: BlockID;
};

export type ObjectBlockWrite = BlockWrite & {
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
        insertBlock(db, block);
    } else {
        updateBlock(db, block);
    }

    return block;
}

export function writeObject(db: Database, input: ObjectWrite): Obj {
    const objectID = input.id ?? createAvailableObjectID(db);
    const blocks = flattenBlocks(db, input.blocks);
    const object: Obj = {
        id: objectID,
        parentID: input.parentID,
        name: input.name,
        properties: input.properties ?? {},
        blocks,
    };

    const write = db.transaction(() => {
        if (input.id === undefined) {
            insertObject(db, object);
            syncObjectBlocks(db, objectID, blocks);
        } else {
            updateObject(db, object);
        }
    });

    write();
    return object;
}

/** Assigns IDs and flattens a recursive block tree into stored placements. */
function flattenBlocks(db: Database, roots: ObjectBlockWrite[]): ObjectBlock[] {
    const blocks: ObjectBlock[] = [];
    const usedIDs = new Set<BlockID>();

    const visit = (children: ObjectBlockWrite[], parentBlockID?: BlockID): void => {
        children.forEach((input, position) => {
            const id = input.id ?? createAvailableBlockID(db, usedIDs);
            if (usedIDs.has(id)) {
                throw new Error(`Duplicate block ID in object: ${id}`);
            }
            if (input.id !== undefined && !isBlock(db, id)) {
                throw new Error(`Block not found: ${id}`);
            }

            usedIDs.add(id);
            blocks.push({
                id,
                content: input.content,
                properties: input.properties ?? {},
                parentBlockID,
                position,
            });
            visit(input.children, id);
        });
    };

    visit(roots);
    return blocks;
}

/** Generates an object ID that is not already stored. */
function createAvailableObjectID(db: Database): ObjID {
    let id = createObjID();
    while (isObject(db, id)) {
        id = createObjID();
    }
    return id;
}

/** Generates a block ID that is neither stored nor reserved by the current write. */
function createAvailableBlockID(db: Database, reserved: Set<BlockID> = new Set()): BlockID {
    let id = createBlockID();
    while (reserved.has(id) || isBlock(db, id)) {
        id = createBlockID();
    }
    return id;
}

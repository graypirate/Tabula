import type { StoredObject, StoredObjectBlock } from "../core/db/types";
import type { BlockID, ObjectBlock } from "../core/types/block";
import type { Obj } from "../core/types/object";

export function expandStoredObject(object: StoredObject): Obj {
    return {
        ...object,
        blocks: expandStoredObjectBlocks(object.blocks),
    };
}

export function expandStoredObjectBlocks(blocks: StoredObjectBlock[]): ObjectBlock[] {
    const roots: ObjectBlock[] = [];
    const blocksByID = new Map<BlockID, ObjectBlock>();

    for (const { parentBlockID, position: _, ...storedBlock } of blocks) {
        const block: ObjectBlock = {
            ...storedBlock,
            children: [],
        };
        blocksByID.set(block.id, block);

        if (parentBlockID === undefined) {
            roots.push(block);
            continue;
        }

        const parent = blocksByID.get(parentBlockID);
        if (parent === undefined) {
            throw new Error(`Parent block ${parentBlockID} was not expanded before child ${block.id}`);
        }
        parent.children.push(block);
    }

    return roots;
}

export function flattenObjectBlocks(blocks: ObjectBlock[]): StoredObjectBlock[] {
    const storedBlocks: StoredObjectBlock[] = [];

    const visit = (children: ObjectBlock[], parentBlockID?: BlockID): void => {
        children.forEach((block, position) => {
            storedBlocks.push({
                id: block.id,
                content: block.content,
                properties: block.properties,
                parentBlockID,
                position,
            });
            visit(block.children, block.id);
        });
    };

    visit(blocks);
    return storedBlocks;
}

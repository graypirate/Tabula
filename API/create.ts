import type { Database } from "bun:sqlite";

import { insertBlock, isBlock } from "../core/db/blocks";
import { insertObject, isObject } from "../core/db/objects";
import { insertSilo, isSilo } from "../core/db/silos";
import type { Block } from "../core/types/block";
import type { Obj } from "../core/types/object";
import type { SiloMetadata } from "../core/types/silo";
import { createBlockID, createObjID, createSiloID } from "../core/utils/id";

type Properties = Record<string, unknown>;

export function createSilo(
    db: Database,
    parentID: string,
    name: string,
    properties: Properties = {},
): SiloMetadata {
    const silo: SiloMetadata = {
        id: createAvailableID(createSiloID, (id) => isSilo(db, id)),
        parentID,
        name,
        properties,
    };

    insertSilo(db, silo);
    return silo;
}

export function createObject(
    db: Database,
    parentID: string,
    name: string,
    properties: Properties = {},
): Obj {
    const object: Obj = {
        id: createAvailableID(createObjID, (id) => isObject(db, id)),
        parentID,
        name,
        properties,
        blocks: [],
    };

    insertObject(db, object);
    return object;
}

export function createBlock(
    db: Database,
    content: string,
    properties: Properties = {},
): Block {
    const block: Block = {
        id: createAvailableID(createBlockID, (id) => isBlock(db, id)),
        content,
        properties,
    };

    insertBlock(db, block);
    return block;
}

/** Generates an entity ID that is not already stored. */
function createAvailableID(createID: () => string, exists: (id: string) => boolean): string {
    let id = createID();
    while (exists(id)) {
        id = createID();
    }
    return id;
}

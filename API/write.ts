import type { Database } from "bun:sqlite";

import {
    entityExists,
    readEntityParentID,
    writeEntityTree,
} from "../core/storage";
import type { Block, BlockID } from "../core/types/block";
import type { Entity } from "../core/types/graph";
import type { Obj, ObjID } from "../core/types/object";
import { createBlockID, createObjID } from "../core/utils/id";
import {
    type BlockResult,
    type Result,
    type ObjectResult,
    type BlockWrite,
    type ObjectWrite,
    type Write,
} from "./types";

type WriteOptions = {
    parentID?: string;
};

/**
 * Creates or replaces an object or block tree.
 * @param db - The database receiving the write
 * @param input - The recursive entity input
 * @param options - Optional parent placement for the root entity
 * @returns The stored parent-aware recursive entity result
 */
export function writeEntity(
    db: Database,
    input: Write,
    options: WriteOptions = {},
): Result {
    const entity = prepareEntity(db, input);
    const stored = writeEntityTree(db, entity, options.parentID ?? undefined);
    return {
        parentID: readEntityParentID(db, stored.id),
        entity: stored,
    };
}

/**
 * Creates or replaces a block tree.
 * @param db - The database receiving the write
 * @param input - The recursive block input
 * @param options - Optional parent placement for the root block
 * @returns The stored recursive block tree
 */
export function writeBlock(
    db: Database,
    input: BlockWrite,
    options: WriteOptions = {},
): BlockResult {
    const result = writeEntity(db, input, options);
    assertBlockResult(result);
    return result;
}

/**
 * Creates or replaces an object tree.
 * @param db - The database receiving the write
 * @param input - The recursive object input
 * @param options - Optional parent placement for the root object
 * @returns The stored recursive object tree
 */
export function writeObject(
    db: Database,
    input: ObjectWrite,
    options: WriteOptions = {},
): ObjectResult {
    const result = writeEntity(db, input, options);
    assertObjectResult(result);
    return result;
}

/** Assigns IDs while producing a recursive public entity tree. */
function prepareEntity(db: Database, input: Write): Entity {
    const usedIDs = new Set<string>();

    const visit = (entity: Write): Entity => {
        const id = entity.id ?? createAvailableEntityID(db, entity.type, usedIDs);
        if (usedIDs.has(id)) {
            throw new Error(`Duplicate entity ID in write tree: ${id}`);
        }
        usedIDs.add(id);

        const children = entity.children.map(visit);

        if (entity.type === "object") {
            return {
                id,
                type: "object",
                name: entity.name,
                properties: entity.properties ?? {},
                children,
            };
        }

        return {
            id,
            type: "block",
            content: entity.content,
            properties: entity.properties ?? {},
            children,
        };
    };

    return visit(input);
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

/** Generates an unused entity ID for the requested entity type. */
function createAvailableEntityID(db: Database, type: Entity["type"], reserved: Set<string>): string {
    const createID = type === "object" ? createObjID : createBlockID;
    let id = createID();
    while (reserved.has(id) || entityExists(db, id)) {
        id = createID();
    }
    return id;
}

import type { Database } from "bun:sqlite";

import {
    blockExists,
    createEntity as createStoredEntity,
    objectExists,
    readEntityParentID,
    readEntityTree,
} from "../core/storage";
import type { Entity } from "../core/types/entity";
import { createBlockID, createObjID } from "../core/utils/id";
import {
    type BlockResult,
    type EntityCreate,
    type EntityCreateOptions,
    type EntityResult,
    type ObjectResult,
    type Properties,
} from "./types";

/**
 * Creates an object or block with no children.
 * @param db - The database receiving the object
 * @param input - The object or block creation input
 * @param options - Optional parent placement
 * @returns The parent-aware created entity result
 */
export function createEntity(
    db: Database,
    input: EntityCreate,
    options: EntityCreateOptions = {},
): EntityResult {
    const entity = buildEntity(db, input);
    createStoredEntity(db, entity, options.parentID ?? undefined);
    return entityResult(db, entity.id);
}

/**
 * Creates an object with no children.
 * @param db - The database receiving the object
 * @param name - The object name
 * @param properties - Optional object properties
 * @param options - Optional parent placement
 * @returns The created recursive object
 */
export function createObject(
    db: Database,
    name: string,
    properties: Properties = {},
    options: EntityCreateOptions = {},
): ObjectResult {
    const result = createEntity(db, {
        type: "object" as const,
        name,
        properties,
    }, options);
    assertObjectResult(result);
    return result;
}

/**
 * Creates a block with no children.
 * @param db - The database receiving the block
 * @param content - The block text content
 * @param properties - Optional block properties
 * @param options - Optional parent placement
 * @returns The created recursive block
 */
export function createBlock(
    db: Database,
    content: string,
    properties: Properties = {},
    options: EntityCreateOptions = {},
): BlockResult {
    const result = createEntity(db, {
        type: "block" as const,
        content,
        properties,
    }, options);
    assertBlockResult(result);
    return result;
}

function buildEntity(db: Database, input: EntityCreate): Entity {
    if (input.type === "object") {
        return {
            id: createAvailableID(createObjID, (id) => objectExists(db, id)),
            type: "object",
            name: input.name,
            properties: input.properties ?? {},
            children: [],
        };
    }

    return {
        id: createAvailableID(createBlockID, (id) => blockExists(db, id)),
        type: "block",
        content: input.content,
        properties: input.properties ?? {},
        children: [],
    };
}

function entityResult(db: Database, entityID: string): EntityResult {
    return {
        parentID: readEntityParentID(db, entityID),
        entity: readEntityTree(db, entityID),
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

/** Generates an entity ID that is not already stored. */
function createAvailableID(createID: () => string, exists: (id: string) => boolean): string {
    let id = createID();
    while (exists(id)) {
        id = createID();
    }
    return id;
}

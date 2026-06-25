import type { Database } from "bun:sqlite";

import {
    blockExists,
    createEntity as createStoredEntity,
    objectExists,
    readEntityParentID,
    readEntityTree,
} from "../core/storage";
import type { Entity } from "../core/types/graph";
import type { JSONRecord } from "../core/types/json";
import { createBlockID, createObjID } from "../core/utils/id";
import {
    type BlockResult,
    type Create,
    type Result,
    type ObjectResult,
} from "./types";

type CreateOptions = {
    parentID?: string;
};

/**
 * Creates an object or block with no children.
 * @param db - The SQLite database backing the workspace
 * @param input - The object or block creation input
 * @param options - Optional parent placement
 * @returns The parent-aware created entity result
 */
export function create(
    db: Database,
    input: Create,
    options: CreateOptions = {},
): Result {
    const entity = buildEntity(db, input);
    createStoredEntity(db, entity, options.parentID ?? undefined);
    return entityResult(db, entity.id);
}

/**
 * Creates an object with no children.
 * @param db - The SQLite database backing the workspace
 * @param name - The object name
 * @param properties - Optional object properties
 * @param options - Optional parent placement
 * @returns The created recursive object
 */
export function createObject(
    db: Database,
    name: string,
    properties: JSONRecord = {},
    options: CreateOptions = {},
): ObjectResult {
    const result = create(db, {
        type: "object" as const,
        name,
        properties,
    }, options);
    assertObjectResult(result);
    return result;
}

/**
 * Creates a block with no children.
 * @param db - The SQLite database backing the workspace
 * @param content - The block text content
 * @param properties - Optional block properties
 * @param options - Optional parent placement
 * @returns The created recursive block
 */
export function createBlock(
    db: Database,
    content: string,
    properties: JSONRecord = {},
    options: CreateOptions = {},
): BlockResult {
    const result = create(db, {
        type: "block" as const,
        content,
        properties,
    }, options);
    assertBlockResult(result);
    return result;
}

function buildEntity(db: Database, input: Create): Entity {
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

function entityResult(db: Database, entityID: string): Result {
    return {
        parentID: readEntityParentID(db, entityID),
        entity: readEntityTree(db, entityID),
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

/** Generates an entity ID that is not already stored. */
function createAvailableID(createID: () => string, exists: (id: string) => boolean): string {
    let id = createID();
    while (exists(id)) {
        id = createID();
    }
    return id;
}

import type {
    BlockWrite,
    ObjectBlockWrite,
    ObjectWrite,
} from "../API/index.ts";
import { CLIInputError } from "./errors.ts";

export type WriteInput =
    | { entity: "block"; value: BlockWrite }
    | { entity: "object"; value: ObjectWrite };

type JSONObject = Record<string, unknown>;

const blockFields = new Set(["id", "content", "properties"]);
const objectBlockFields = new Set(["id", "content", "properties", "children"]);
const objectFields = new Set(["id", "parentID", "name", "properties", "blocks"]);

export function parseWriteInput(input: string): WriteInput {
    const value = parseJSONObject(input);
    const hasBlocks = Object.hasOwn(value, "blocks");
    const hasContent = Object.hasOwn(value, "content");

    if (hasBlocks === hasContent) {
        throw inputError(
            "INVALID_WRITE_SHAPE",
            "Write input must be an object with blocks or a block with content",
        );
    }

    return hasBlocks
        ? { entity: "object", value: validateObjectWrite(value) }
        : { entity: "block", value: validateBlockWrite(value, "$") };
}

function validateObjectWrite(value: JSONObject): ObjectWrite {
    rejectUnknownFields(value, objectFields, "$");
    const id = optionalID(value, "id", "o_", "$.id");
    const parentID = requiredString(value, "parentID", "$.parentID");
    if (!parentID.startsWith("d_") && !parentID.startsWith("s_")) {
        throw inputError(
            "INVALID_PARENT_ID",
            `Object parent must be a database or silo ID: ${parentID}`,
            { path: "$.parentID" },
        );
    }

    const blocks = requiredArray(value, "blocks", "$.blocks");
    const explicitIDs = new Set<string>();
    const validatedBlocks = blocks.map((block, index) =>
        validateObjectBlock(block, `$.blocks[${index}]`, explicitIDs)
    );

    return {
        ...(id === undefined ? {} : { id }),
        parentID,
        name: requiredString(value, "name", "$.name"),
        ...optionalProperties(value, "$.properties"),
        blocks: validatedBlocks,
    };
}

function validateObjectBlock(
    value: unknown,
    path: string,
    explicitIDs: Set<string>,
): ObjectBlockWrite {
    const object = requireObject(value, path);
    rejectUnknownFields(object, objectBlockFields, path);
    const id = optionalID(object, "id", "b_", `${path}.id`);

    if (id !== undefined) {
        if (explicitIDs.has(id)) {
            throw inputError(
                "DUPLICATE_BLOCK_ID",
                `Duplicate block ID: ${id}`,
                { path: `${path}.id` },
            );
        }
        explicitIDs.add(id);
    }

    const children = requiredArray(object, "children", `${path}.children`);
    return {
        ...(id === undefined ? {} : { id }),
        content: requiredString(object, "content", `${path}.content`),
        ...optionalProperties(object, `${path}.properties`),
        children: children.map((child, index) =>
            validateObjectBlock(child, `${path}.children[${index}]`, explicitIDs)
        ),
    };
}

function validateBlockWrite(value: JSONObject, path: string): BlockWrite {
    rejectUnknownFields(value, blockFields, path);
    const id = optionalID(value, "id", "b_", `${path}.id`);
    return {
        ...(id === undefined ? {} : { id }),
        content: requiredString(value, "content", `${path}.content`),
        ...optionalProperties(value, `${path}.properties`),
    };
}

function parseJSONObject(input: string): JSONObject {
    if (input.trim().length === 0) {
        throw inputError("MISSING_INPUT", "JSON input is required on stdin");
    }

    let value: unknown;
    try {
        value = JSON.parse(input) as unknown;
    } catch (error) {
        throw inputError("INVALID_JSON", "stdin is not valid JSON", {
            message: error instanceof Error ? error.message : String(error),
        });
    }

    return requireObject(value, "$");
}

function requireObject(value: unknown, path: string): JSONObject {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw inputError("INVALID_OBJECT", `Expected object at ${path}`, { path });
    }
    return value as JSONObject;
}

function rejectUnknownFields(value: JSONObject, allowed: Set<string>, path: string): void {
    for (const field of Object.keys(value)) {
        if (!allowed.has(field)) {
            throw inputError(
                "UNKNOWN_FIELD",
                `Unknown field at ${path}: ${field}`,
                { path, field },
            );
        }
    }
}

function requiredString(value: JSONObject, field: string, path: string): string {
    const result = value[field];
    if (typeof result !== "string") {
        throw inputError("INVALID_FIELD", `Expected string at ${path}`, { path });
    }
    return result;
}

function requiredArray(value: JSONObject, field: string, path: string): unknown[] {
    const result = value[field];
    if (!Array.isArray(result)) {
        throw inputError("INVALID_FIELD", `Expected array at ${path}`, { path });
    }
    return result;
}

function optionalID(
    value: JSONObject,
    field: string,
    prefix: string,
    path: string,
): string | undefined {
    if (!Object.hasOwn(value, field)) {
        return undefined;
    }

    const id = requiredString(value, field, path);
    if (!id.startsWith(prefix)) {
        throw inputError("INVALID_ID", `Expected ${prefix} ID at ${path}: ${id}`, { path });
    }
    return id;
}

function optionalProperties(
    value: JSONObject,
    path: string,
): { properties?: Record<string, unknown> } {
    if (!Object.hasOwn(value, "properties")) {
        return {};
    }
    return { properties: requireObject(value.properties, path) };
}

function inputError(code: string, message: string, details?: unknown): CLIInputError {
    return new CLIInputError(code, message, details);
}

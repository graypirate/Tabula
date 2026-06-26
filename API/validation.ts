import type {
    BlockWrite,
    JSONRecord,
    ObjectWrite,
    Write,
} from "./types";

type JSONObject = JSONRecord;

const blockFields = new Set(["id", "type", "content", "properties", "children"]);
const objectFields = new Set(["id", "type", "name", "properties", "children"]);

export class AgentDBInputError extends Error {
    override readonly name = "AgentDBInputError";

    constructor(readonly code: string, message: string, readonly details?: unknown) {
        super(message);
    }
}

export function validateWriteInput(value: unknown): Write {
    const explicitIDs = new Set<string>();
    return validateEntityWrite(value, "$", explicitIDs);
}

function validateEntityWrite(
    value: unknown,
    path: string,
    explicitIDs: Set<string>,
): Write {
    const object = requireObject(value, path);
    const type = requiredString(object, "type", `${path}.type`);

    if (type === "object") {
        return validateObjectWrite(object, path, explicitIDs);
    }
    if (type === "block") {
        return validateBlockWrite(object, path, explicitIDs);
    }

    throw inputError("INVALID_ENTITY_TYPE", `Invalid entity type at ${path}.type: ${type}`, {
        path: `${path}.type`,
    });
}

function validateObjectWrite(
    value: JSONObject,
    path: string,
    explicitIDs: Set<string>,
): ObjectWrite {
    rejectUnknownFields(value, objectFields, path);
    const id = optionalID(value, "id", "o_", `${path}.id`, explicitIDs);
    const children = requiredArray(value, "children", `${path}.children`);

    return {
        ...(id === undefined ? {} : { id }),
        type: "object",
        name: requiredString(value, "name", `${path}.name`),
        ...optionalProperties(value, `${path}.properties`),
        children: children.map((child, index) =>
            validateEntityWrite(child, `${path}.children[${index}]`, explicitIDs)
        ),
    };
}

function validateBlockWrite(
    value: JSONObject,
    path: string,
    explicitIDs: Set<string>,
): BlockWrite {
    rejectUnknownFields(value, blockFields, path);
    const id = optionalID(value, "id", "b_", `${path}.id`, explicitIDs);
    const children = requiredArray(value, "children", `${path}.children`);

    return {
        ...(id === undefined ? {} : { id }),
        type: "block",
        content: requiredString(value, "content", `${path}.content`),
        ...optionalProperties(value, `${path}.properties`),
        children: children.map((child, index) =>
            validateEntityWrite(child, `${path}.children[${index}]`, explicitIDs)
        ),
    };
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
    explicitIDs: Set<string>,
): string | undefined {
    if (!Object.hasOwn(value, field)) {
        return undefined;
    }

    const id = requiredString(value, field, path);
    if (!id.startsWith(prefix)) {
        throw inputError("INVALID_ID", `Expected ${prefix} ID at ${path}: ${id}`, { path });
    }
    if (explicitIDs.has(id)) {
        throw inputError("DUPLICATE_ENTITY_ID", `Duplicate entity ID: ${id}`, { path });
    }
    explicitIDs.add(id);
    return id;
}

function optionalProperties(
    value: JSONObject,
    path: string,
): { properties?: JSONRecord } {
    if (!Object.hasOwn(value, "properties")) {
        return {};
    }
    return { properties: requireObject(value.properties, path) };
}

function inputError(code: string, message: string, details?: unknown): AgentDBInputError {
    return new AgentDBInputError(code, message, details);
}

import type {
    BlockWrite,
    JSONRecord,
    ObjectWrite,
} from "../index.ts";
import { AgentDBInputError, validateWriteInput } from "../index.ts";
import { CLIInputError } from "./errors.ts";

export type WriteInput =
    | { entity: "block"; value: BlockWrite }
    | { entity: "object"; value: ObjectWrite };

type JSONObject = JSONRecord;

export function parseWriteInput(input: string): WriteInput {
    const value = parseJSONObject(input);
    let entity: ReturnType<typeof validateWriteInput>;
    try {
        entity = validateWriteInput(value);
    } catch (error) {
        if (error instanceof AgentDBInputError) {
            throw inputError(error.code, error.message, error.details);
        }
        throw error;
    }

    return entity.type === "object"
        ? { entity: "object", value: entity }
        : { entity: "block", value: entity };
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

function inputError(code: string, message: string, details?: unknown): CLIInputError {
    return new CLIInputError(code, message, details);
}

import { describe, expect, test } from "bun:test";

import {
    TabulaInputError,
    validateWriteInput,
} from "../../API";

describe("API write input validation", () => {
    test("accepts recursive mixed object and block trees", () => {
        expect(validateWriteInput({
            type: "object",
            name: "Example",
            properties: { status: "active" },
            children: [{
                type: "block",
                content: "Parent",
                children: [{
                    id: "o_existing",
                    type: "object",
                    name: "Child",
                    properties: { done: false },
                    children: [],
                }],
            }],
        })).toEqual({
            type: "object",
            name: "Example",
            properties: { status: "active" },
            children: [{
                type: "block",
                content: "Parent",
                children: [{
                    id: "o_existing",
                    type: "object",
                    name: "Child",
                    properties: { done: false },
                    children: [],
                }],
            }],
        });

        expect(validateWriteInput({
            id: "b_existing",
            type: "block",
            content: "Updated",
            properties: {},
            children: [{
                type: "block",
                content: "Child",
                children: [],
            }],
        })).toEqual({
            id: "b_existing",
            type: "block",
            content: "Updated",
            properties: {},
            children: [{
                type: "block",
                content: "Child",
                children: [],
            }],
        });
    });

    test("rejects unknown fields", () => {
        expectValidationError({
            type: "object",
            name: "Old",
            parentID: "d_parent",
            children: [],
        }, "UNKNOWN_FIELD");
        expectValidationError({
            type: "block",
            content: "Flat",
            position: 0,
            children: [],
        }, "UNKNOWN_FIELD");
    });

    test("rejects invalid discriminators and missing children", () => {
        expectValidationError({}, "INVALID_FIELD");
        expectValidationError({
            type: "page",
            name: "Invalid",
            children: [],
        }, "INVALID_ENTITY_TYPE");
        expectValidationError({
            type: "object",
            name: "Missing children",
        }, "INVALID_FIELD");
    });

    test("rejects wrong ID prefixes and duplicate explicit IDs", () => {
        expectValidationError({
            id: "b_invalid",
            type: "object",
            name: "Invalid",
            children: [],
        }, "INVALID_ID");
        expectValidationError({
            type: "object",
            name: "Duplicate",
            children: [{
                id: "b_same",
                type: "block",
                content: "First",
                children: [{
                    id: "b_same",
                    type: "block",
                    content: "Second",
                    children: [],
                }],
            }],
        }, "DUPLICATE_ENTITY_ID");
    });
});

function expectValidationError(input: unknown, code: string): void {
    try {
        validateWriteInput(input);
        throw new Error("Expected TabulaInputError");
    } catch (error) {
        expect(error).toBeInstanceOf(TabulaInputError);
        expect((error as TabulaInputError).code).toBe(code);
    }
}

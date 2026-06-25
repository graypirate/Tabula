import { describe, expect, test } from "bun:test";

import { CLIInputError } from "../../CLI/errors.ts";
import { parseWriteInput } from "../../CLI/json.ts";

describe("CLI JSON validation", () => {
    test("validates recursive object writes using the public entity shape", () => {
        expect(parseWriteInput(JSON.stringify({
            type: "object",
            name: "Example",
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
        }))).toEqual({
            entity: "object",
            value: {
                type: "object",
                name: "Example",
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
            },
        });
    });

    test("validates recursive block replacement with children", () => {
        expect(parseWriteInput(JSON.stringify({
            type: "block",
            content: "New",
            children: [],
        }))).toEqual({
            entity: "block",
            value: {
                type: "block",
                content: "New",
                children: [],
            },
        });
        expect(parseWriteInput(JSON.stringify({
            id: "b_existing",
            type: "block",
            content: "Updated",
            properties: {},
            children: [{
                type: "block",
                content: "Child",
                children: [],
            }],
        }))).toEqual({
            entity: "block",
            value: {
                id: "b_existing",
                type: "block",
                content: "Updated",
                properties: {},
                children: [{
                    type: "block",
                    content: "Child",
                    children: [],
                }],
            },
        });
    });

    test("rejects malformed JSON and non-object roots", () => {
        expectJSONError("", "MISSING_INPUT");
        expectJSONError("{invalid", "INVALID_JSON");
        expectJSONError("[]", "INVALID_OBJECT");
    });

    test("rejects unknown fields and removed storage/public fields", () => {
        expectJSONError(
            '{"type":"block","content":"Block"}',
            "INVALID_FIELD",
        );
        expectJSONError(JSON.stringify({
            type: "object",
            parentID: "d_parent",
            name: "Old",
            blocks: [],
            children: [],
        }), "UNKNOWN_FIELD");
        expectJSONError(JSON.stringify({
            type: "block",
            content: "Flat",
            parentBlockID: "b_parent",
            position: 0,
            children: [],
        }), "UNKNOWN_FIELD");
    });

    test("rejects invalid IDs, missing children, and duplicate explicit entity IDs", () => {
        expectJSONError(
            '{"id":null,"type":"block","content":"Block","children":[]}',
            "INVALID_FIELD",
        );
        expectJSONError(JSON.stringify({
            id: "b_invalid",
            type: "object",
            name: "Invalid",
            children: [],
        }), "INVALID_ID");
        expectJSONError(JSON.stringify({
            type: "object",
            name: "Missing children",
        }), "INVALID_FIELD");
        expectJSONError(JSON.stringify({
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
        }), "DUPLICATE_ENTITY_ID");
    });

    test("rejects invalid discriminators", () => {
        expectJSONError("{}", "INVALID_FIELD");
        expectJSONError(
            '{"type":"page","name":"Invalid","children":[]}',
            "INVALID_ENTITY_TYPE",
        );
    });
});

function expectJSONError(input: string, code: string): void {
    try {
        parseWriteInput(input);
        throw new Error("Expected CLIInputError");
    } catch (error) {
        expect(error).toBeInstanceOf(CLIInputError);
        expect((error as CLIInputError).code).toBe(code);
    }
}

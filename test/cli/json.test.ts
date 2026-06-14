import { describe, expect, test } from "bun:test";

import { CLIInputError } from "../../CLI/errors.ts";
import { parseWriteInput } from "../../CLI/json.ts";

describe("CLI JSON validation", () => {
    test("validates recursive object writes using the public API shape", () => {
        expect(parseWriteInput(JSON.stringify({
            parentID: "s_parent",
            name: "Example",
            blocks: [{
                content: "Parent",
                children: [{
                    id: "b_existing",
                    content: "Child",
                    properties: { done: false },
                    children: [],
                }],
            }],
        }))).toEqual({
            entity: "object",
            value: {
                parentID: "s_parent",
                name: "Example",
                blocks: [{
                    content: "Parent",
                    children: [{
                        id: "b_existing",
                        content: "Child",
                        properties: { done: false },
                        children: [],
                    }],
                }],
            },
        });
    });

    test("validates standalone block creation and replacement", () => {
        expect(parseWriteInput('{"content":"New"}')).toEqual({
            entity: "block",
            value: { content: "New" },
        });
        expect(parseWriteInput(
            '{"id":"b_existing","content":"Updated","properties":{}}',
        )).toEqual({
            entity: "block",
            value: {
                id: "b_existing",
                content: "Updated",
                properties: {},
            },
        });
    });

    test("rejects malformed JSON and non-object roots", () => {
        expectJSONError("", "MISSING_INPUT");
        expectJSONError("{invalid", "INVALID_JSON");
        expectJSONError("[]", "INVALID_OBJECT");
    });

    test("rejects unknown fields and flat storage fields", () => {
        expectJSONError(
            '{"content":"Block","type":"block"}',
            "UNKNOWN_FIELD",
        );
        expectJSONError(JSON.stringify({
            parentID: "d_parent",
            name: "Flat",
            blocks: [{
                content: "Block",
                parentBlockID: "b_parent",
                position: 0,
                children: [],
            }],
        }), "UNKNOWN_FIELD");
    });

    test("rejects invalid IDs, missing children, and duplicate explicit block IDs", () => {
        expectJSONError(
            '{"id":null,"content":"Block"}',
            "INVALID_FIELD",
        );
        expectJSONError(JSON.stringify({
            parentID: "o_invalid",
            name: "Invalid parent",
            blocks: [],
        }), "INVALID_PARENT_ID");
        expectJSONError(JSON.stringify({
            parentID: "d_parent",
            name: "Missing children",
            blocks: [{ content: "Block" }],
        }), "INVALID_FIELD");
        expectJSONError(JSON.stringify({
            parentID: "d_parent",
            name: "Duplicate",
            blocks: [{
                id: "b_same",
                content: "First",
                children: [{
                    id: "b_same",
                    content: "Second",
                    children: [],
                }],
            }],
        }), "DUPLICATE_BLOCK_ID");
    });

    test("rejects ambiguous write shapes", () => {
        expectJSONError("{}", "INVALID_WRITE_SHAPE");
        expectJSONError(
            '{"content":"Block","blocks":[]}',
            "INVALID_WRITE_SHAPE",
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

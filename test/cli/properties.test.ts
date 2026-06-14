import { expect, test } from "bun:test";

import { CLIInputError } from "../../CLI/errors.ts";
import { parseProperties } from "../../CLI/properties.ts";

test("parses property values as JSON before falling back to strings", () => {
    expect(parseProperties([
        "count=2",
        "enabled=true",
        'tags=["cli","json"]',
        'metadata={"stage":"mvp"}',
        "note=plain text",
    ])).toEqual({
        count: 2,
        enabled: true,
        tags: ["cli", "json"],
        metadata: { stage: "mvp" },
        note: "plain text",
    });
});

test("rejects malformed and duplicate properties", () => {
    expectPropertyError(["missing-separator"], "INVALID_PROPERTY");
    expectPropertyError(["status=active", "status=done"], "DUPLICATE_PROPERTY");
});

function expectPropertyError(values: string[], code: string): void {
    try {
        parseProperties(values);
        throw new Error("Expected CLIInputError");
    } catch (error) {
        expect(error).toBeInstanceOf(CLIInputError);
        expect((error as CLIInputError).code).toBe(code);
    }
}

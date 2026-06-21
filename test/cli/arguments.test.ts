import { describe, expect, test } from "bun:test";

import {
    inferEntityType,
    parseCommand,
} from "../../CLI/arguments.ts";
import { CLIInputError } from "../../CLI/errors.ts";

describe("CLI argument parsing", () => {
    test("parses quick create commands without interpreting properties", () => {
        expect(parseCommand([
            "create",
            "object",
            "--database",
            "agent.db",
            "--name",
            "Example",
            "--property",
            "count=2",
            "--property",
            "note=plain text",
        ])).toEqual({
            action: "create",
            entity: "object",
            database: "agent.db",
            name: "Example",
            propertyValues: ["count=2", "note=plain text"],
        });

        expect(parseCommand([
            "create",
            "block",
            "--database=agent.db",
            "--content=Example",
            "--parent=o_parent",
        ])).toEqual({
            action: "create",
            entity: "block",
            database: "agent.db",
            content: "Example",
            propertyValues: [],
            parentID: "o_parent",
        });
    });

    test("parses write without reading or validating stdin", () => {
        expect(parseCommand(["write", "--database", "agent.db"])).toEqual({
            action: "write",
            database: "agent.db",
        });
    });

    test("parses entity commands and search filters", () => {
        expect(parseCommand([
            "list",
            "b_example",
            "--database",
            "agent.db",
        ])).toEqual({
            action: "list",
            database: "agent.db",
            id: "b_example",
        });

        expect(parseCommand([
            "search",
            "example",
            "--database",
            "agent.db",
            "--type",
            "object",
        ])).toEqual({
            action: "search",
            database: "agent.db",
            query: "example",
            type: "object",
        });
    });

    test("infers every entity type from its ID prefix", () => {
        expect(inferEntityType("d_example")).toBe("database");
        expect(inferEntityType("o_example")).toBe("object");
        expect(inferEntityType("b_example")).toBe("block");
        expectInputError(() => inferEntityType("x_example"), "INVALID_ID");
    });

    test("rejects obsolete commands, invalid contexts, and short flags", () => {
        expectInputError(
            () => parseCommand(["update", "o_example", "--database", "agent.db"]),
            "INVALID_COMMAND",
        );
        expectInputError(
            () => parseCommand([
                "create",
                "folder",
                "--database",
                "agent.db",
                "--name",
                "Invalid",
            ]),
            "INVALID_ENTITY_TYPE",
        );
        expectInputError(
            () => parseCommand([
                "create",
                "block",
                "--database",
                "agent.db",
                "--content",
                "Invalid",
                "--parent",
                "d_parent",
            ]),
            "INVALID_PARENT",
        );
        expectInputError(
            () => parseCommand([
                "list",
                "o_example",
                "--database",
                "agent.db",
                "--object",
                "o_other",
            ]),
            "UNKNOWN_OPTION",
        );
        expectInputError(
            () => parseCommand(["read", "o_example", "-d", "agent.db"]),
            "UNKNOWN_OPTION",
        );
        expectInputError(
            () => parseCommand(["get", "o_example", "--database", "agent.db"]),
            "INVALID_COMMAND",
        );
    });

    test("requires the database and validates search and deletion targets", () => {
        expectInputError(() => parseCommand(["read", "o_example"]), "MISSING_OPTION");
        expectInputError(
            () => parseCommand([
                "search",
                "example",
                "--database",
                "agent.db",
                "--type",
                "database",
            ]),
            "INVALID_SEARCH_TYPE",
        );
        expectInputError(
            () => parseCommand(["delete", "d_example", "--database", "agent.db"]),
            "UNSUPPORTED_DELETE",
        );
    });

    test("rejects unknown, duplicate, and command-inappropriate options", () => {
        expectInputError(
            () => parseCommand([
                "read",
                "o_example",
                "--database",
                "agent.db",
                "--format",
                "markdown",
            ]),
            "UNKNOWN_OPTION",
        );
        expectInputError(
            () => parseCommand([
                "read",
                "o_example",
                "--database",
                "first.db",
                "--database",
                "second.db",
            ]),
            "DUPLICATE_OPTION",
        );
        expectInputError(
            () => parseCommand([
                "write",
                "--database",
                "agent.db",
                "--name",
                "invalid",
            ]),
            "INVALID_OPTION",
        );
    });
});

function expectInputError(callback: () => unknown, code: string): void {
    try {
        callback();
        throw new Error("Expected CLIInputError");
    } catch (error) {
        expect(error).toBeInstanceOf(CLIInputError);
        expect((error as CLIInputError).code).toBe(code);
    }
}

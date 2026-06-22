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
            "--workspace",
            "agent",
            "--name",
            "Example",
            "--property",
            "count=2",
            "--property",
            "note=plain text",
        ])).toEqual({
            action: "create",
            entity: "object",
            workspace: "agent",
            name: "Example",
            propertyValues: ["count=2", "note=plain text"],
        });

        expect(parseCommand([
            "create",
            "block",
            "--workspace=agent",
            "--content=Example",
            "--parent=o_parent",
        ])).toEqual({
            action: "create",
            entity: "block",
            workspace: "agent",
            content: "Example",
            propertyValues: [],
            parentID: "o_parent",
        });
    });

    test("parses write without reading or validating stdin", () => {
        expect(parseCommand(["write", "--workspace", "agent"])).toEqual({
            action: "write",
            workspace: "agent",
        });
    });

    test("parses entity commands and search filters", () => {
        expect(parseCommand(["list"])).toEqual({
            action: "listWorkspaces",
        });

        expect(parseCommand([
            "list",
            "b_example",
            "--workspace",
            "agent",
        ])).toEqual({
            action: "list",
            workspace: "agent",
            id: "b_example",
        });

        expect(parseCommand([
            "search",
            "example",
            "--workspace",
            "agent",
            "--type",
            "object",
        ])).toEqual({
            action: "search",
            workspace: "agent",
            query: "example",
            type: "object",
        });
    });

    test("infers every entity type from its ID prefix", () => {
        expect(inferEntityType("d_example")).toBe("workspace");
        expect(inferEntityType("o_example")).toBe("object");
        expect(inferEntityType("b_example")).toBe("block");
        expectInputError(() => inferEntityType("x_example"), "INVALID_ID");
    });

    test("rejects obsolete commands, invalid contexts, and short flags", () => {
        expectInputError(
            () => parseCommand(["update", "o_example", "--workspace", "agent"]),
            "INVALID_COMMAND",
        );
        expectInputError(
            () => parseCommand([
                "create",
                "folder",
                "--workspace",
                "agent",
                "--name",
                "Invalid",
            ]),
            "INVALID_ENTITY_TYPE",
        );
        expectInputError(
            () => parseCommand([
                "create",
                "block",
                "--workspace",
                "agent",
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
                "--workspace",
                "agent",
                "--object",
                "o_other",
            ]),
            "UNKNOWN_OPTION",
        );
        expectInputError(
            () => parseCommand(["read", "o_example", "-w", "agent"]),
            "UNKNOWN_OPTION",
        );
        expectInputError(
            () => parseCommand(["get", "o_example", "--workspace", "agent"]),
            "INVALID_COMMAND",
        );
    });

    test("requires the workspace and validates search and deletion targets", () => {
        expectInputError(() => parseCommand(["read", "o_example"]), "MISSING_OPTION");
        expectInputError(
            () => parseCommand([
                "search",
                "example",
                "--workspace",
                "agent",
                "--type",
                "workspace",
            ]),
            "INVALID_SEARCH_TYPE",
        );
        expectInputError(
            () => parseCommand(["delete", "d_example", "--workspace", "agent"]),
            "UNSUPPORTED_DELETE",
        );
    });

    test("rejects unknown, duplicate, and command-inappropriate options", () => {
        expectInputError(
            () => parseCommand([
                "read",
                "o_example",
                "--workspace",
                "agent",
                "--format",
                "markdown",
            ]),
            "UNKNOWN_OPTION",
        );
        expectInputError(
            () => parseCommand([
                "read",
                "o_example",
                "--workspace",
                "first",
                "--workspace",
                "second",
            ]),
            "DUPLICATE_OPTION",
        );
        expectInputError(
            () => parseCommand([
                "write",
                "--workspace",
                "agent",
                "--name",
                "invalid",
            ]),
            "INVALID_OPTION",
        );
    });

    test("validates workspace names instead of accepting paths", () => {
        for (const workspace of ["./notes.sqlite", "/tmp/notes.sqlite", "../notes", ".hidden", "bad:name"]) {
            expectInputError(
                () => parseCommand(["read", "o_example", "--workspace", workspace]),
                "INVALID_WORKSPACE_NAME",
            );
        }

        expectInputError(
            () => parseCommand(["init", "--workspace", "agent", "--name", "Agent"]),
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

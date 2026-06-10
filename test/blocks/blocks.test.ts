import { afterEach, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";

import {
    deleteBlock,
    deleteBlocks,
    getBlock,
    getBlockMetadata,
    getBlocks,
    getDescendantBlocks,
    insertBlock,
    insertBlocks,
    isBlock,
    syncObjectBlocks,
    updateBlock,
    updateBlocks,
} from "../../core/db/blocks";
import { getDatabaseMetadata, initDatabase } from "../../core/db/init";
import { insertObject } from "../../core/db/objects";

let db: Database | undefined;

afterEach(() => {
    db?.close();
    db = undefined;
});

test("block operations preserve caller IDs and separate direct from descendant reads", async () => {
    db = initDatabase(":memory:");
    const databaseID = getDatabaseMetadata(db).id;
    insertObject(db, { id: "o_blocks", parentID: databaseID, name: "Blocks" });

    insertBlock(db, block("b_parent", "o_blocks", 0, "Parent"));
    insertBlock(db, block("b_child", "b_parent", 0, "Child", { role: "body" }));
    insertBlock(db, block("b_sibling", "o_blocks", 1, "Sibling"));

    expect(isBlock(db, "b_parent")).toBe(true);
    expect(getBlockMetadata(db, "b_child")).toEqual({
        id: "b_child",
        parentID: "b_parent",
        position: 0,
        properties: {
            role: "body",
        },
    });
    expect(getBlocks(db, "o_blocks").map((item) => item.id)).toEqual([
        "b_parent",
        "b_sibling",
    ]);
    expect(getDescendantBlocks(db, "o_blocks").map((item) => item.id)).toEqual([
        "b_parent",
        "b_child",
        "b_sibling",
    ]);
});

test("insertBlocks accepts unordered parent-child input and rejects invalid structures", async () => {
    db = initDatabase(":memory:");
    const databaseID = getDatabaseMetadata(db).id;
    insertObject(db, { id: "o_batch", parentID: databaseID, name: "Batch" });

    insertBlocks(db, [
        block("b_grandchild", "b_child", 0, "Grandchild"),
        block("b_child", "b_parent", 0, "Child"),
        block("b_parent", "o_batch", 0, "Parent"),
    ]);
    expect(getDescendantBlocks(db, "o_batch").map((item) => item.id)).toEqual([
        "b_parent",
        "b_child",
        "b_grandchild",
    ]);

    expect(() => insertBlock(db!, block("x_invalid", "o_batch", 1, "Invalid"))).toThrow("Invalid block id");
    expect(() => insertBlock(db!, block("b_missing", "o_missing", 1, "Missing"))).toThrow("Object parent not found");
    expect(() => insertBlock(db!, block("b_self", "b_self", 1, "Self"))).toThrow("cannot parent itself");
    expect(() => insertBlock(db!, block("b_unsafe", "o_batch", Number.MAX_SAFE_INTEGER + 1, "Unsafe"))).toThrow("Invalid block position");
    expect(() => insertBlocks(db!, [
        block("b_cycle_one", "b_cycle_two", 0, "One"),
        block("b_cycle_two", "b_cycle_one", 0, "Two"),
    ])).toThrow("cycle");
});

test("updateBlocks handles position swaps and rejects cycles", async () => {
    db = initDatabase(":memory:");
    const databaseID = getDatabaseMetadata(db).id;
    insertObject(db, { id: "o_update_blocks", parentID: databaseID, name: "Update Blocks" });
    insertBlocks(db, [
        block("b_first", "o_update_blocks", 0, "First"),
        block("b_second", "o_update_blocks", 1, "Second"),
        block("b_child", "b_first", 0, "Child"),
    ]);

    updateBlocks(db, [
        block("b_first", "o_update_blocks", 1, "First updated"),
        block("b_second", "o_update_blocks", 0, "Second updated"),
    ]);
    expect(getBlocks(db, "o_update_blocks").map((item) => item.id)).toEqual([
        "b_second",
        "b_first",
    ]);
    expect(getBlock(db, "b_first").content).toBe("First updated");

    updateBlock(db, block("b_child", "b_second", 0, "Moved child"));
    expect(getBlock(db, "b_child").parentID).toBe("b_second");

    expect(() => updateBlock(db!, block("b_second", "b_child", 0, "Cycle"))).toThrow("cycle");
});

test("syncObjectBlocks requires an existing object", () => {
    db = initDatabase(":memory:");

    expect(() => syncObjectBlocks(db!, "o_missing", [])).toThrow("Object parent not found");
    expect(() => syncObjectBlocks(db!, "o_missing", [
        block("b_orphan", "o_missing", 0, "Orphan"),
    ])).toThrow("Object parent not found");
    expect(isBlock(db, "b_orphan")).toBe(false);
});

test("deleteBlock and deleteBlocks remove complete subtrees", async () => {
    db = initDatabase(":memory:");
    const databaseID = getDatabaseMetadata(db).id;
    insertObject(db, { id: "o_delete", parentID: databaseID, name: "Delete" });
    insertBlocks(db, [
        block("b_parent", "o_delete", 0, "Parent"),
        block("b_child", "b_parent", 0, "Child"),
        block("b_grandchild", "b_child", 0, "Grandchild"),
        block("b_keep", "o_delete", 1, "Keep"),
    ]);

    expect(deleteBlock(db, "b_parent")).toBe(true);
    expect(deleteBlock(db, "b_parent")).toBe(false);
    expect(getDescendantBlocks(db, "o_delete").map((item) => item.id)).toEqual(["b_keep"]);

    insertBlocks(db, [
        block("b_a", "o_delete", 2, "A"),
        block("b_b", "o_delete", 3, "B"),
    ]);
    expect(deleteBlocks(db, ["b_a", "b_b"])).toBe(2);
    expect(getDescendantBlocks(db, "o_delete").map((item) => item.id)).toEqual(["b_keep"]);
});

function block(id: string, parentID: string, position: number, content: string, properties?: Record<string, unknown>) {
    return {
        id,
        parentID,
        position,
        content,
        properties,
    };
}

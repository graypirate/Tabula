import { afterEach, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";

import {
    deleteStoredBlock,
    deleteStoredBlocks,
    getBlockMetadata,
    getStoredBlock,
    insertStoredBlock,
    insertStoredBlocks,
    isStoredBlock,
    updateStoredBlock,
    updateStoredBlocks,
} from "../../core/storage/db/blocks";
import {
    getDirectEntityChildren,
    replaceEntityChildren,
} from "../../core/storage/db/edges";
import { getDatabaseMetadata, initDatabase } from "../../core/storage/db/init";
import { insertStoredNode } from "../../core/storage/db/nodes";
import { insertStoredObject } from "../../core/storage/db/objects";
import {
    deleteBlockTree,
    readBlockTree,
} from "../../core/storage";
import type { StoredBlock } from "../../core/storage/types";
import type { JSONRecord } from "../../core/types/json";

let db: Database | undefined;

afterEach(() => {
    db?.close();
    db = undefined;
});

test("blocks support row CRUD", () => {
    db = initDatabase(":memory:");

    insertStoredNode(db, { id: "b_one", type: "block" });
    insertStoredBlock(db, block("b_one", "One", { kind: "text" }));
    insertStoredNode(db, { id: "b_two", type: "block" });
    insertStoredNode(db, { id: "b_three", type: "block" });
    insertStoredBlocks(db, [
        block("b_two", "Two"),
        block("b_three", "Three"),
    ]);

    expect(getBlockMetadata(db, "b_one")).toEqual({
        id: "b_one",
        type: "block",
        properties: { kind: "text" },
    });
    expect(getStoredBlock(db, "b_one")).toEqual({
        id: "b_one",
        type: "block",
        content: "One",
        properties: { kind: "text" },
    });

    updateStoredBlock(db, block("b_one", "One updated"));
    updateStoredBlocks(db, [
        block("b_two", "Two updated"),
        block("b_three", "Three updated"),
    ]);

    expect(getStoredBlock(db, "b_one").content).toBe("One updated");
    expect(getStoredBlock(db, "b_two").content).toBe("Two updated");
    expect(deleteStoredBlocks(db, ["b_two", "b_three"])).toBe(2);
    expect(deleteStoredBlock(db, "b_one")).toBe(true);
    expect(deleteStoredBlock(db, "b_one")).toBe(false);
    expect(isStoredBlock(db, "b_two")).toBe(false);
});

test("block deletion removes descendants in the global containment tree", () => {
    db = initDatabase(":memory:");
    insertStoredNode(db, { id: "b_parent", type: "block" });
    insertStoredNode(db, { id: "b_child", type: "block" });
    insertStoredNode(db, { id: "b_grandchild", type: "block" });
    insertStoredBlocks(db, [
        block("b_parent", "Parent"),
        block("b_child", "Child"),
        block("b_grandchild", "Grandchild"),
    ]);
    replaceEntityChildren(db, new Map([
        ["b_parent", [{ type: "block", id: "b_child" }]],
        ["b_child", [{ type: "block", id: "b_grandchild" }]],
    ]));

    expect(deleteBlockTree(db, "b_parent")).toBe(true);
    expect(isStoredBlock(db, "b_parent")).toBe(false);
    expect(isStoredBlock(db, "b_child")).toBe(false);
    expect(isStoredBlock(db, "b_grandchild")).toBe(false);
});

test("containment rejects database block roots, database children, duplicate siblings, and cycles", () => {
    db = initDatabase(":memory:");
    const databaseID = getDatabaseMetadata(db).id;
    insertStoredNode(db, { id: "o_root", type: "object" });
    insertStoredObject(db, {
        id: "o_root",
        type: "object",
        name: "Root",
    });
    insertStoredNode(db, { id: "b_one", type: "block" });
    insertStoredNode(db, { id: "b_two", type: "block" });
    insertStoredNode(db, { id: "b_three", type: "block" });
    insertStoredBlocks(db, [
        block("b_one", "One"),
        block("b_two", "Two"),
        block("b_three", "Three"),
    ]);

    expect(() => replaceEntityChildren(db!, new Map([
        [databaseID, [{ type: "block", id: "b_one" }]],
    ]))).toThrow("Database children must be objects");

    expect(() => replaceEntityChildren(db!, new Map([
        ["o_root", [{ type: "database", id: databaseID } as never]],
    ]))).toThrow("Database cannot be a child entity");

    expect(() => replaceEntityChildren(db!, new Map([
        ["b_one", [
            { type: "block", id: "b_two" },
            { type: "block", id: "b_two" },
        ]],
    ]))).toThrow("Duplicate child entity");

    replaceEntityChildren(db, new Map([
        ["b_one", [{ type: "block", id: "b_two" }]],
        ["b_two", [{ type: "block", id: "b_three" }]],
    ]));

    expect(() => replaceEntityChildren(db!, new Map([
        ["b_three", [{ type: "block", id: "b_one" }]],
    ]))).toThrow("Entity cycle");
    expect(readBlockTree(db, "b_one").children[0]?.id).toBe("b_two");
    expect(getDirectEntityChildren(db, "b_three")).toEqual([]);
});

test("a child cannot be submitted under two parents in one replacement", () => {
    db = initDatabase(":memory:");
    insertStoredNode(db, { id: "b_first_parent", type: "block" });
    insertStoredNode(db, { id: "b_second_parent", type: "block" });
    insertStoredNode(db, { id: "b_child", type: "block" });
    insertStoredBlocks(db, [
        block("b_first_parent", "First parent"),
        block("b_second_parent", "Second parent"),
        block("b_child", "Child"),
    ]);

    expect(() => replaceEntityChildren(db!, new Map([
        ["b_first_parent", [{ type: "block", id: "b_child" }]],
        ["b_second_parent", [{ type: "block", id: "b_child" }]],
    ]))).toThrow("Duplicate child entity: b_child");

    expect(getDirectEntityChildren(db, "b_first_parent")).toEqual([]);
    expect(getDirectEntityChildren(db, "b_second_parent")).toEqual([]);
});

test("attaching an existing block under a new parent moves it", () => {
    db = initDatabase(":memory:");
    insertStoredNode(db, { id: "b_first_parent", type: "block" });
    insertStoredNode(db, { id: "b_second_parent", type: "block" });
    insertStoredNode(db, { id: "b_moved", type: "block" });
    insertStoredBlocks(db, [
        block("b_first_parent", "First parent"),
        block("b_second_parent", "Second parent"),
        block("b_moved", "Moved"),
    ]);

    replaceEntityChildren(db, new Map([
        ["b_first_parent", [{ type: "block", id: "b_moved" }]],
    ]));

    expect(readBlockTree(db, "b_first_parent").children.map((child) => child.id)).toEqual(["b_moved"]);

    replaceEntityChildren(db, new Map([
        ["b_second_parent", [{ type: "block", id: "b_moved" }]],
    ]));

    expect(getDirectEntityChildren(db, "b_first_parent")).toEqual([]);
    expect(readBlockTree(db, "b_second_parent").children.map((child) => child.id)).toEqual(["b_moved"]);
    expect(isStoredBlock(db, "b_moved")).toBe(true);
});

function block(id: string, content: string, properties?: JSONRecord): StoredBlock {
    return {
        id,
        type: "block",
        content,
        properties,
    };
}

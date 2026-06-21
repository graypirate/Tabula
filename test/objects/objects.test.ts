import { afterEach, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";

import { insertStoredBlock, isStoredBlock } from "../../core/storage/db/blocks";
import {
    appendDatabaseRootObject,
    getDatabaseRootObjects,
    readStoredObjectTree,
    replaceEntityChildren,
} from "../../core/storage/db/entities";
import { getDatabaseMetadata, initDatabase } from "../../core/storage/db/init";
import {
    deleteStoredObject,
    getObjectMetadata,
    getStoredObject,
    insertStoredObject,
    isStoredObject,
    updateObjectMetadata,
    updateStoredObject,
} from "../../core/storage/db/objects";

let db: Database | undefined;

afterEach(() => {
    db?.close();
    db = undefined;
});

test("object operations persist caller IDs and metadata", () => {
    db = initDatabase(":memory:", "Test Database");

    insertStoredObject(db, {
        id: "o_root",
        type: "object",
        name: "Root Object",
        properties: { scope: "database" },
    });

    expect(getObjectMetadata(db, "o_root")).toEqual({
        id: "o_root",
        type: "object",
        name: "Root Object",
        properties: { scope: "database" },
    });
    expect(getStoredObject(db, "o_root")).toEqual(getObjectMetadata(db, "o_root"));
    expect(isStoredObject(db, "o_root")).toBe(true);
    expect(() => insertStoredObject(db!, {
        id: "o_root",
        type: "object",
        name: "Duplicate",
    })).toThrow("Entity already exists");

    updateObjectMetadata(db, {
        id: "o_root",
        type: "object",
        name: "Updated Object",
        properties: { scope: "updated" },
    });
    expect(getObjectMetadata(db, "o_root")).toEqual({
        id: "o_root",
        type: "object",
        name: "Updated Object",
        properties: { scope: "updated" },
    });
});

test("database roots are stored as object containment edges", () => {
    db = initDatabase(":memory:");
    const databaseID = getDatabaseMetadata(db).id;

    insertStoredObject(db, { id: "o_first", type: "object", name: "First" });
    insertStoredObject(db, { id: "o_second", type: "object", name: "Second" });

    appendDatabaseRootObject(db, databaseID, "o_first");
    appendDatabaseRootObject(db, databaseID, "o_second");
    appendDatabaseRootObject(db, databaseID, "o_first");

    expect(getDatabaseRootObjects(db, databaseID)).toEqual(["o_first", "o_second"]);
});

test("objects read recursive mixed children through entity containment", () => {
    db = initDatabase(":memory:");
    insertStoredObject(db, { id: "o_root", type: "object", name: "Root" });
    insertStoredObject(db, { id: "o_nested", type: "object", name: "Nested" });
    insertStoredBlock(db, {
        id: "b_parent",
        type: "block",
        content: "Parent",
    });
    replaceEntityChildren(db, new Map([
        ["o_root", [{ type: "block", id: "b_parent" }]],
        ["b_parent", [{ type: "object", id: "o_nested" }]],
    ]));

    expect(readStoredObjectTree(db, "o_root")).toEqual({
        id: "o_root",
        type: "object",
        name: "Root",
        properties: {},
        children: [{
            id: "b_parent",
            type: "block",
            content: "Parent",
            properties: {},
            children: [{
                id: "o_nested",
                type: "object",
                name: "Nested",
                properties: {},
                children: [],
            }],
        }],
    });
});

test("deleteStoredObject removes the object subtree", () => {
    db = initDatabase(":memory:");
    insertStoredObject(db, { id: "o_root", type: "object", name: "Root" });
    insertStoredBlock(db, {
        id: "b_child",
        type: "block",
        content: "Child",
    });
    replaceEntityChildren(db, new Map([
        ["o_root", [{ type: "block", id: "b_child" }]],
    ]));

    expect(deleteStoredObject(db, "o_root")).toBe(true);
    expect(deleteStoredObject(db, "o_root")).toBe(false);
    expect(isStoredObject(db, "o_root")).toBe(false);
    expect(isStoredBlock(db, "b_child")).toBe(false);
});

test("updateStoredObject updates metadata without changing children", () => {
    db = initDatabase(":memory:");
    insertStoredObject(db, { id: "o_root", type: "object", name: "Root" });
    insertStoredBlock(db, {
        id: "b_child",
        type: "block",
        content: "Child",
    });
    replaceEntityChildren(db, new Map([
        ["o_root", [{ type: "block", id: "b_child" }]],
    ]));

    updateStoredObject(db, {
        id: "o_root",
        type: "object",
        name: "Updated",
        properties: { done: true },
    });

    const object = readStoredObjectTree(db, "o_root");
    expect(object.name).toBe("Updated");
    expect(object.properties).toEqual({ done: true });
    expect(object.children.map((child) => child.id)).toEqual(["b_child"]);
});

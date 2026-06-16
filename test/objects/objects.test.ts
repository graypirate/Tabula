import { afterEach, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";

import {
    getStoredBlock,
    getBlockPlacements,
    insertStoredBlock,
    insertStoredBlocks,
    insertBlockPlacements,
    isStoredBlock,
} from "../../core/db/blocks";
import { getDatabaseMetadata, initDatabase } from "../../core/db/init";
import {
    deleteStoredObject,
    getStoredObject,
    getObjectMetadata,
    insertStoredObject,
    isStoredObject,
    updateStoredObject,
    updateObjectMetadata,
} from "../../core/db/objects";
import type { StoredObject, StoredObjectBlock } from "../../core/db/types";

let db: Database | undefined;

afterEach(() => {
    db?.close();
    db = undefined;
});

test("object operations persist caller IDs under database and silo parents", () => {
    db = initDatabase(":memory:", "Test Database");
    const databaseID = getDatabaseMetadata(db).id;
    const siloID = "s_projects";

    db.query(`
        INSERT INTO silos (id, parent_id, name, properties)
        VALUES ($id, $parentID, $name, '{}')
    `).run({
        $id: siloID,
        $parentID: databaseID,
        $name: "Projects",
    });

    insertStoredObject(db, {
        id: "o_root",
        parentID: databaseID,
        name: "Root Object",
        properties: {
            scope: "database",
        },
    });
    insertStoredObject(db, {
        id: "o_nested",
        parentID: siloID,
        name: "Nested Object",
    });

    expect(getObjectMetadata(db, "o_root")).toEqual({
        id: "o_root",
        parentID: databaseID,
        name: "Root Object",
        properties: {
            scope: "database",
        },
    });
    expect(getObjectMetadata(db, "o_nested").parentID).toBe(siloID);
    expect(isStoredObject(db, "o_root")).toBe(true);
    expect(() => insertStoredObject(db!, {
        id: "o_root",
        parentID: databaseID,
        name: "Duplicate",
    })).toThrow("Object already exists");
    expect(() => insertStoredObject(db!, {
        id: "o_missing_parent",
        parentID: "s_missing",
        name: "Missing Parent",
    })).toThrow("Silo parent not found");

    updateObjectMetadata(db, {
        id: "o_root",
        parentID: siloID,
        name: "Moved Object",
        properties: {
            scope: "silo",
        },
    });
    expect(getObjectMetadata(db, "o_root")).toEqual({
        id: "o_root",
        parentID: siloID,
        name: "Moved Object",
        properties: {
            scope: "silo",
        },
    });
});

test("empty objects compile with no blocks", () => {
    db = initDatabase(":memory:");
    const databaseID = getDatabaseMetadata(db).id;

    insertStoredObject(db, {
        id: "o_empty",
        parentID: databaseID,
        name: "Empty",
    });

    expect(getStoredObject(db, "o_empty")).toEqual({
        id: "o_empty",
        parentID: databaseID,
        name: "Empty",
        properties: {},
        blocks: [],
    });
});

test("getStoredObject compiles nested placements in depth-first preorder", () => {
    db = initDatabase(":memory:");
    const databaseID = getDatabaseMetadata(db).id;

    insertStoredObject(db, {
        id: "o_tree",
        parentID: databaseID,
        name: "Tree",
    });
    insertStoredBlocks(db, [
        block("b_child_two", "Child two"),
        block("b_second", "Second"),
        block("b_grandchild", "Grandchild"),
        block("b_parent", "Parent"),
        block("b_child_one", "Child one"),
    ]);
    insertBlockPlacements(db, "o_tree", [
        placement("b_child_two", "b_parent", 1),
        placement("b_second", undefined, 1),
        placement("b_grandchild", "b_child_one", 0),
        placement("b_parent", undefined, 0),
        placement("b_child_one", "b_parent", 0),
    ]);

    const object = getStoredObject(db, "o_tree");
    expect(object.blocks.map((item) => item.id)).toEqual([
        "b_parent",
        "b_child_one",
        "b_grandchild",
        "b_child_two",
        "b_second",
    ]);
    expect(object.blocks.map((item) => item.parentBlockID)).toEqual([
        undefined,
        "b_parent",
        "b_child_one",
        "b_parent",
        undefined,
    ]);
});

test("updateStoredObject synchronizes placements and globally updates shared blocks", () => {
    db = initDatabase(":memory:");
    const databaseID = getDatabaseMetadata(db).id;

    insertStoredObject(db, {
        id: "o_update",
        parentID: databaseID,
        name: "Original",
    });
    insertStoredObject(db, {
        id: "o_shared",
        parentID: databaseID,
        name: "Shared",
    });
    insertStoredBlocks(db, [
        block("b_keep", "Keep"),
        block("b_remove", "Remove"),
        block("b_remove_child", "Remove child"),
    ]);
    insertBlockPlacements(db, "o_update", [
        placement("b_keep", undefined, 0),
        placement("b_remove", undefined, 1),
        placement("b_remove_child", "b_remove", 0),
    ]);
    insertBlockPlacements(db, "o_shared", [
        placement("b_keep", undefined, 0),
    ]);

    const desired: StoredObject = {
        id: "o_update",
        parentID: databaseID,
        name: "Updated",
        properties: {
            status: "done",
        },
        blocks: [
            objectBlock("b_new_child", "New child", "b_keep", 0),
            objectBlock("b_new", "New", undefined, 1),
            objectBlock("b_keep", "Keep updated", undefined, 0),
        ],
    };

    updateStoredObject(db, desired);
    const updated = getStoredObject(db, "o_update");
    expect(updated.name).toBe("Updated");
    expect(updated.properties).toEqual({ status: "done" });
    expect(updated.blocks.map((item) => item.id)).toEqual([
        "b_keep",
        "b_new_child",
        "b_new",
    ]);
    expect(updated.blocks[0]?.content).toBe("Keep updated");
    expect(getStoredObject(db, "o_shared").blocks[0]?.content).toBe("Keep updated");
    expect(getStoredBlock(db, "b_remove").content).toBe("Remove");
    expect(getStoredBlock(db, "b_remove_child").content).toBe("Remove child");
    expect(getBlockPlacements(db, "o_update").some((item) => item.id === "b_remove")).toBe(false);
    expect(isStoredBlock(db, "b_new")).toBe(true);

    updateObjectMetadata(db, {
        id: "o_update",
        parentID: databaseID,
        name: "Metadata Only",
    });
    expect(getStoredObject(db, "o_update").blocks).toHaveLength(3);
});

test("deleteStoredObject removes only its placements and preserves canonical blocks", () => {
    db = initDatabase(":memory:");
    const databaseID = getDatabaseMetadata(db).id;

    insertStoredObject(db, { id: "o_one", parentID: databaseID, name: "One" });
    insertStoredObject(db, { id: "o_two", parentID: databaseID, name: "Two" });
    insertStoredBlock(db, block("b_shared", "Shared"));
    insertBlockPlacements(db, "o_one", [placement("b_shared", undefined, 0)]);
    insertBlockPlacements(db, "o_two", [placement("b_shared", undefined, 0)]);

    expect(deleteStoredObject(db, "o_one")).toBe(true);
    expect(deleteStoredObject(db, "o_one")).toBe(false);
    expect(isStoredBlock(db, "b_shared")).toBe(true);
    expect(getStoredObject(db, "o_two").blocks.map((item) => item.id)).toEqual(["b_shared"]);
    expect(db.query(`
        SELECT COUNT(*) AS count
        FROM object_blocks
        WHERE object_id = 'o_one'
    `).get()).toEqual({ count: 0 });
});

function block(id: string, content: string) {
    return { id, content };
}

function placement(id: string, parentBlockID: string | undefined, position: number) {
    return { id, parentBlockID, position };
}

function objectBlock(id: string, content: string, parentBlockID: string | undefined, position: number): StoredObjectBlock {
    return { id, content, parentBlockID, position };
}

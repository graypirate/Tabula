import { afterEach, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";

import { insertBlocks } from "../../core/db/blocks";
import { getDatabaseMetadata, initDatabase } from "../../core/db/init";
import {
    deleteObject,
    getObject,
    getObjectMetadata,
    insertObject,
    isObject,
    updateObject,
    updateObjectMetadata,
} from "../../core/db/objects";
import type { Obj } from "../../core/types/object";

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

    insertObject(db, {
        id: "o_root",
        parentID: databaseID,
        name: "Root Object",
        properties: {
            scope: "database",
        },
    });
    insertObject(db, {
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
    expect(isObject(db, "o_root")).toBe(true);
    expect(() => insertObject(db!, {
        id: "o_root",
        parentID: databaseID,
        name: "Duplicate",
    })).toThrow("Object already exists");
    expect(() => insertObject(db!, {
        id: "o_missing_parent",
        parentID: "s_missing",
        name: "Missing Parent",
    })).toThrow("Silo parent not found");
});

test("getObject returns every descendant block in depth-first preorder", () => {
    db = initDatabase(":memory:");
    const databaseID = getDatabaseMetadata(db).id;

    insertObject(db, {
        id: "o_tree",
        parentID: databaseID,
        name: "Tree",
    });
    insertBlocks(db, [
        block("b_child_two", "b_parent", 1, "Child two"),
        block("b_second", "o_tree", 1, "Second"),
        block("b_grandchild", "b_child_one", 0, "Grandchild"),
        block("b_parent", "o_tree", 0, "Parent"),
        block("b_child_one", "b_parent", 0, "Child one"),
    ]);

    const object = getObject(db, "o_tree");
    expect(object.blocks.map((item) => item.id)).toEqual([
        "b_parent",
        "b_child_one",
        "b_grandchild",
        "b_child_two",
        "b_second",
    ]);
});

test("updateObject atomically reconciles the complete block subtree", () => {
    db = initDatabase(":memory:");
    const databaseID = getDatabaseMetadata(db).id;

    insertObject(db, {
        id: "o_update",
        parentID: databaseID,
        name: "Original",
    });
    insertBlocks(db, [
        block("b_keep", "o_update", 0, "Keep"),
        block("b_remove", "o_update", 1, "Remove"),
        block("b_remove_child", "b_remove", 0, "Remove child"),
    ]);

    const desired: Obj = {
        id: "o_update",
        parentID: databaseID,
        name: "Updated",
        properties: {
            status: "done",
        },
        blocks: [
            block("b_new_child", "b_keep", 0, "New child"),
            block("b_new", "o_update", 1, "New"),
            block("b_keep", "o_update", 0, "Keep updated"),
        ],
    };

    updateObject(db, desired);
    const updated = getObject(db, "o_update");
    expect(updated.name).toBe("Updated");
    expect(updated.properties).toEqual({ status: "done" });
    expect(updated.blocks.map((item) => item.id)).toEqual([
        "b_keep",
        "b_new_child",
        "b_new",
    ]);
    expect(updated.blocks[0]?.content).toBe("Keep updated");
    expect(db.query("SELECT 1 FROM blocks WHERE id = 'b_remove'").get()).toBeNull();
    expect(db.query("SELECT 1 FROM blocks WHERE id = 'b_remove_child'").get()).toBeNull();

    updateObjectMetadata(db, {
        id: "o_update",
        parentID: databaseID,
        name: "Metadata Only",
    });
    expect(getObject(db, "o_update").blocks).toHaveLength(3);

    expect(deleteObject(db, "o_update")).toBe(true);
    expect(deleteObject(db, "o_update")).toBe(false);
    expect(db.query("SELECT COUNT(*) AS count FROM blocks").get()).toEqual({ count: 0 });
});

test("updateObject rejects blocks belonging to another object", () => {
    db = initDatabase(":memory:");
    const databaseID = getDatabaseMetadata(db).id;

    insertObject(db, { id: "o_one", parentID: databaseID, name: "One" });
    insertObject(db, { id: "o_two", parentID: databaseID, name: "Two" });
    insertBlocks(db, [block("b_foreign", "o_two", 0, "Foreign")]);

    expect(() => updateObject(db!, {
        id: "o_one",
        parentID: databaseID,
        name: "One",
        blocks: [block("b_foreign", "o_one", 0, "Stolen")],
    })).toThrow("belongs to another object");
    expect(getObject(db, "o_two").blocks[0]?.id).toBe("b_foreign");
});

function block(id: string, parentID: string, position: number, content: string) {
    return {
        id,
        parentID,
        position,
        content,
    };
}

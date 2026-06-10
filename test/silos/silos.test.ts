import { afterEach, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";

import { getDatabaseMetadata, initDatabase } from "../../core/db/init";

let db: Database | undefined;

afterEach(() => {
    db?.close();
    db = undefined;
});

test("database schema stores silos with required database or silo parents", () => {
    db = initDatabase(":memory:");
    const databaseID = getDatabaseMetadata(db).id;

    db.query(`
        INSERT INTO silos (id, parent_id, name, properties)
        VALUES ($id, $parentID, $name, '{}')
    `).run({
        $id: "s_root",
        $parentID: databaseID,
        $name: "Root",
    });
    db.query(`
        INSERT INTO silos (id, parent_id, name, properties)
        VALUES ($id, $parentID, $name, '{}')
    `).run({
        $id: "s_child",
        $parentID: "s_root",
        $name: "Child",
    });

    expect(db.query("SELECT parent_id AS parentID FROM silos WHERE id = 's_root'").get()).toEqual({
        parentID: databaseID,
    });
    expect(db.query("SELECT parent_id AS parentID FROM silos WHERE id = 's_child'").get()).toEqual({
        parentID: "s_root",
    });
    expect(() => db!.query(`
        INSERT INTO silos (id, parent_id, name, properties)
        VALUES ('s_parentless', NULL, 'Parentless', '{}')
    `).run()).toThrow();
});

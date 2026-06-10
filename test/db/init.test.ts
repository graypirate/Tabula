import { afterEach, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";

import { getDatabaseMetadata, initDatabase, SchemaVersion } from "../../core/db/init";

let db: Database | undefined;

afterEach(() => {
    db?.close();
    db = undefined;
});

test("initDatabase creates one database metadata row with an optional name", () => {
    db = initDatabase(":memory:");
    const unnamed = getDatabaseMetadata(db);
    expect(unnamed.id.startsWith("d_")).toBe(true);
    expect(unnamed.name).toBeUndefined();
    expect(unnamed.schemaVersion).toBe(SchemaVersion);
    expect(db.query('SELECT COUNT(*) AS count FROM "database"').get()).toEqual({ count: 1 });
    expect(() => db!.query(`
        INSERT INTO "database" (id, name, schema_version)
        VALUES ('d_second', NULL, 1)
    `).run()).toThrow("database metadata already exists");

    db.close();
    db = initDatabase(":memory:", "Named Database");
    expect(getDatabaseMetadata(db).name).toBe("Named Database");
});

import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    getDatabaseMetadata,
    initDatabase,
    openDatabase,
    SchemaVersion,
} from "../../core/db/init";

let db: Database | undefined;
let tempDirectory: string | undefined;

afterEach(() => {
    db?.close();
    db = undefined;
    if (tempDirectory) {
        rmSync(tempDirectory, { recursive: true, force: true });
        tempDirectory = undefined;
    }
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

test("initDatabase rejects a declared non-v2 database without modifying it", () => {
    const path = createTempDatabasePath();
    const legacy = new Database(path);
    legacy.exec(`
        CREATE TABLE "database" (
            id TEXT PRIMARY KEY,
            name TEXT,
            schema_version INTEGER NOT NULL
        );
        INSERT INTO "database" (id, name, schema_version)
        VALUES ('d_legacy', 'Legacy', 1);
    `);
    const before = readSchema(legacy);
    legacy.close();

    expect(() => initDatabase(path)).toThrow(
        `Unsupported database schema version 1; expected ${SchemaVersion}`,
    );

    const unchanged = new Database(path);
    expect(readSchema(unchanged)).toEqual(before);
    expect(unchanged.query('SELECT * FROM "database"').all()).toEqual([
        { id: "d_legacy", name: "Legacy", schema_version: 1 },
    ]);
    unchanged.close();
});

test("initDatabase rejects an empty metadata table without stamping schema v2", () => {
    const path = createTempDatabasePath();
    const incompatible = new Database(path);
    incompatible.exec(`
        CREATE TABLE "database" (
            id TEXT PRIMARY KEY,
            name TEXT,
            schema_version INTEGER NOT NULL
        );
        CREATE TABLE legacy_objects (id TEXT PRIMARY KEY);
    `);
    const before = readSchema(incompatible);
    incompatible.close();

    expect(() => initDatabase(path)).toThrow(
        `Incompatible database schema; expected valid version ${SchemaVersion} metadata`,
    );

    const unchanged = new Database(path);
    expect(readSchema(unchanged)).toEqual(before);
    expect(unchanged.query('SELECT COUNT(*) AS count FROM "database"').get()).toEqual({ count: 0 });
    unchanged.close();
});

test("openDatabase validates existing metadata without running schema setup", () => {
    const path = createTempDatabasePath();
    db = initDatabase(path, "Existing");
    const metadata = getDatabaseMetadata(db);
    db.close();

    db = openDatabase(path);
    expect(getDatabaseMetadata(db)).toEqual(metadata);
});

function createTempDatabasePath(): string {
    tempDirectory = mkdtempSync(join(tmpdir(), "agentdb-init-"));
    return join(tempDirectory, "database.sqlite");
}

function readSchema(database: Database): unknown[] {
    return database.query(`
        SELECT type, name, tbl_name, sql
        FROM sqlite_master
        WHERE name NOT LIKE 'sqlite_%'
        ORDER BY type, name
    `).all();
}

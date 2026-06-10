import { Database } from "bun:sqlite";

import type { DBMetadata } from "../types/database";
import { createDatabaseID } from "../utils/id";

export const SchemaVersion = 1;

type DatabaseRow = {
    id: string;
    name: string | null;
    schemaVersion: number;
};

/**
 * Opens a database, initializes its schema, and creates its metadata when needed.
 * @param path - The path of the SQLite database
 * @param name - The optional database name
 * @returns The initialized SQLite database connection
 */
export function initDatabase(path: string, name?: string): Database {
    const db = new Database(path);
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec(`
        CREATE TABLE IF NOT EXISTS "database" (
            id TEXT PRIMARY KEY,
            name TEXT,
            schema_version INTEGER NOT NULL
        );

        CREATE TRIGGER IF NOT EXISTS database_singleton_insert
        BEFORE INSERT ON "database"
        WHEN (SELECT COUNT(*) FROM "database") >= 1
        BEGIN
            SELECT RAISE(ABORT, 'database metadata already exists');
        END;

        CREATE TABLE IF NOT EXISTS silos (
            id TEXT PRIMARY KEY,
            parent_id TEXT NOT NULL,
            name TEXT NOT NULL,
            properties TEXT NOT NULL DEFAULT '{}'
                CHECK (json_valid(properties))
        );

        CREATE TABLE IF NOT EXISTS objects (
            id TEXT PRIMARY KEY,
            parent_id TEXT NOT NULL,
            name TEXT NOT NULL,
            properties TEXT NOT NULL DEFAULT '{}'
                CHECK (json_valid(properties))
        );

        CREATE TABLE IF NOT EXISTS blocks (
            id TEXT PRIMARY KEY,
            parent_id TEXT NOT NULL,
            position INTEGER NOT NULL CHECK (position >= 0),
            content TEXT NOT NULL,
            properties TEXT NOT NULL DEFAULT '{}'
                CHECK (json_valid(properties)),
            UNIQUE (parent_id, position)
        );

        CREATE INDEX IF NOT EXISTS silos_parent_id_idx
        ON silos(parent_id);

        CREATE INDEX IF NOT EXISTS objects_parent_id_idx
        ON objects(parent_id);

        CREATE INDEX IF NOT EXISTS blocks_parent_position_idx
        ON blocks(parent_id, position);
    `);

    const metadata = db.query('SELECT id FROM "database" LIMIT 1').get();

    if (!metadata) {
        db.query(`
            INSERT INTO "database" (id, name, schema_version)
            VALUES ($id, $name, $schemaVersion)
        `).run({
            $id: createDatabaseID(),
            $name: name ?? null,
            $schemaVersion: SchemaVersion,
        });
    }

    return db;
}

/**
 * Reads the metadata associated with a database.
 * @param db - The database to read
 * @returns The database metadata
 */
export function getDatabaseMetadata(db: Database): DBMetadata {
    const row = db.query(`
        SELECT
            id,
            name,
            schema_version AS schemaVersion
        FROM "database"
        LIMIT 1
    `).get() as DatabaseRow | null;

    if (!row) {
        throw new Error("Database metadata not found");
    }

    return {
        id: row.id,
        name: row.name ?? undefined,
        schemaVersion: row.schemaVersion,
    };
}

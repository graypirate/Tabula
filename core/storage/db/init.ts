import { Database } from "bun:sqlite";

import type { DBMetadata } from "../../types/database";
import { createDatabaseID } from "../../utils/id";
import schema from "./schema.sql" with { type: "text" };

export const SchemaVersion = "0.2.0";

type DatabaseRow = {
    id: string;
    name: string | null;
    schemaVersion: string;
};

/**
 * Opens a database, initializes its schema, and creates its metadata when needed.
 * @param path - The path of the SQLite database
 * @param name - The optional database name
 * @returns The initialized SQLite database connection
 */
export function initDatabase(path: string, name?: string): Database {
    const db = new Database(path);
    try {
        db.exec("PRAGMA busy_timeout = 5000;");
        db.exec("PRAGMA foreign_keys = ON;");

        const isFresh = isEmptyDatabase(db);

        if (!isFresh) {
            validateDatabaseMetadata(db);
        }

        db.exec("PRAGMA journal_mode = WAL;");
        db.exec(schema);

        if (isFresh) {
            const insertMetadata = db.transaction(() => {
                const databaseID = createDatabaseID();
                db.query(`
                    INSERT INTO entities (id, type)
                    VALUES ($id, 'database')
                `).run({ $id: databaseID });
                db.query(`
                    INSERT INTO "database" (id, name, schema_version)
                    VALUES ($id, $name, $schemaVersion)
                `).run({
                    $id: databaseID,
                    $name: name ?? null,
                    $schemaVersion: SchemaVersion,
                });
            });

            insertMetadata();
        }
    } catch (error) {
        db.close();
        throw error;
    }

    return db;
}

/**
 * Opens an existing initialized database without re-running schema setup.
 * @param path - The path of the SQLite database
 * @returns The opened SQLite database connection
 */
export function openDatabase(path: string): Database {
    const db = new Database(path, { create: false, readwrite: true });
    try {
        db.exec("PRAGMA busy_timeout = 5000;");
        db.exec("PRAGMA foreign_keys = ON;");
        validateDatabaseMetadata(db);
    } catch (error) {
        db.close();
        throw error;
    }

    return db;
}

function isEmptyDatabase(db: Database): boolean {
    const row = db.query(`
        SELECT COUNT(*) AS count
        FROM sqlite_master
        WHERE name NOT LIKE 'sqlite_%'
    `).get() as { count: number };

    return row.count === 0;
}

/**
 * Reads the metadata associated with a database.
 * @param db - The database to read
 * @returns The database metadata
 */
export function getDatabaseMetadata(db: Database): DBMetadata {
    const rows = db.query(`
        SELECT
            id,
            name,
            schema_version AS schemaVersion
        FROM "database"
        LIMIT 2
    `).all() as DatabaseRow[];

    if (rows.length !== 1) {
        throw new Error("Database metadata not found");
    }

    const row = rows[0]!;
    return {
        id: row.id,
        name: row.name ?? undefined,
        schemaVersion: row.schemaVersion,
    };
}

function validateDatabaseMetadata(db: Database): void {
    let metadata: DBMetadata;

    try {
        metadata = getDatabaseMetadata(db);
    } catch {
        throw new Error(
            `Incompatible database schema; expected valid version ${SchemaVersion} metadata`,
        );
    }

    if (metadata.schemaVersion !== SchemaVersion) {
        throw new Error(
            `Unsupported database schema version ${metadata.schemaVersion}; expected ${SchemaVersion}`,
        );
    }
}

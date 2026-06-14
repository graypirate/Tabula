import type { Database } from "bun:sqlite";

import type { SiloID, SiloMetadata } from "../types/silo";
import { DatabasePrefix, SiloPrefix } from "../utils/id";

type SiloRow = {
    id: string;
    parentID: string;
    name: string;
    properties: string;
};

export function insertSilo(db: Database, metadata: SiloMetadata): void {
    validateSiloMetadata(db, metadata);

    if (isSilo(db, metadata.id)) {
        throw new Error(`Silo already exists: ${metadata.id}`);
    }

    db.query(`
        INSERT INTO silos (id, parent_id, name, properties)
        VALUES ($id, $parentID, $name, $properties)
    `).run({
        $id: metadata.id,
        $parentID: metadata.parentID,
        $name: metadata.name,
        $properties: JSON.stringify(metadata.properties ?? {}),
    });
}

export function getSilo(db: Database, siloID: SiloID): SiloMetadata {
    const row = db.query(`
        SELECT
            id,
            parent_id AS parentID,
            name,
            properties
        FROM silos
        WHERE id = $id
    `).get({ $id: siloID }) as SiloRow | null;

    if (!row) {
        throw new Error(`Silo not found: ${siloID}`);
    }

    return {
        id: row.id,
        parentID: row.parentID,
        name: row.name,
        properties: JSON.parse(row.properties) as Record<string, unknown>,
    };
}

export function deleteSilo(db: Database, siloID: SiloID): boolean {
    if (!isSilo(db, siloID)) {
        return false;
    }

    const remove = db.transaction(() => {
        const rows = db.query(`
            WITH RECURSIVE descendants(id) AS (
                SELECT id
                FROM silos
                WHERE id = $id

                UNION

                SELECT child.id
                FROM silos AS child
                JOIN descendants AS parent ON child.parent_id = parent.id
            )
            SELECT id
            FROM descendants
        `).all({ $id: siloID }) as { id: string }[];
        const ids = rows.map((row) => row.id);
        const parameters = { $ids: JSON.stringify(ids) };

        db.query(`
            DELETE FROM objects
            WHERE parent_id IN (SELECT value FROM json_each($ids))
        `).run(parameters);
        db.query(`
            DELETE FROM silos
            WHERE id IN (SELECT value FROM json_each($ids))
        `).run(parameters);
    });

    remove();
    return true;
}

export function isSilo(db: Database, siloID: SiloID): boolean {
    return db.query("SELECT 1 FROM silos WHERE id = $id").get({ $id: siloID }) !== null;
}

function validateSiloMetadata(db: Database, metadata: SiloMetadata): void {
    if (!metadata.id.startsWith(`${SiloPrefix}_`)) {
        throw new Error(`Invalid silo id: ${metadata.id}`);
    }

    if (metadata.parentID.startsWith(`${DatabasePrefix}_`)) {
        if (!db.query('SELECT 1 FROM "database" WHERE id = $id').get({ $id: metadata.parentID })) {
            throw new Error(`Database parent not found: ${metadata.parentID}`);
        }
        return;
    }

    if (metadata.parentID.startsWith(`${SiloPrefix}_`)) {
        if (!isSilo(db, metadata.parentID)) {
            throw new Error(`Silo parent not found: ${metadata.parentID}`);
        }
        return;
    }

    throw new Error(`Silo parent must be a database or silo: ${metadata.parentID}`);
}

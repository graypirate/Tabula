import type { Database } from "bun:sqlite";

import type { BlockID, BlockMetadata } from "../../types/block";
import { BlockPrefix } from "../../utils/id";
import type { StoredBlock } from "../types";

/**
 * Inserts a standalone block row.
 * @param db - The database containing the block
 * @param block - The block metadata and content to insert
 */
export function insertStoredBlock(db: Database, block: StoredBlock): void {
    validateBlock(block);

    db.query(`
        INSERT INTO blocks (id, content, properties)
        VALUES ($id, $content, $properties)
    `).run(blockParameters(block));
}

/**
 * Inserts multiple standalone block rows atomically.
 * @param db - The database containing the blocks
 * @param blocks - The blocks to insert
 */
export function insertStoredBlocks(db: Database, blocks: StoredBlock[]): void {
    if (blocks.length === 0) {
        return;
    }

    validateBlockBatch(blocks);
    const insert = db.transaction(() => {
        for (const block of blocks) {
            insertStoredBlock(db, block);
        }
    });

    insert();
}

/**
 * Inserts or updates a block row without changing its containment children.
 * @param db - The database containing the block
 * @param block - The block metadata and content to persist
 */
export function upsertStoredBlock(db: Database, block: StoredBlock): void {
    validateBlock(block);

    if (isStoredBlock(db, block.id)) {
        db.query(`
            UPDATE blocks
            SET content = $content,
                properties = $properties
            WHERE id = $id
        `).run(blockParameters(block));
        return;
    }

    insertStoredBlock(db, block);
}

/**
 * Reads block metadata without content or children.
 * @param db - The database containing the block
 * @param blockID - The block ID to read
 * @returns The block metadata
 */
export function getBlockMetadata(db: Database, blockID: BlockID): BlockMetadata {
    const row = db.query(`
        SELECT id, properties
        FROM blocks
        WHERE id = $id
    `).get({ $id: blockID }) as { id: BlockID; properties: string } | null;

    if (!row) {
        throw new Error(`Block not found: ${blockID}`);
    }

    return {
        id: row.id,
        type: "block",
        properties: JSON.parse(row.properties) as Record<string, unknown>,
    };
}

/**
 * Reads the stored block row without recursive children.
 * @param db - The database containing the block
 * @param blockID - The block ID to read
 * @returns The stored block metadata and content
 */
export function getStoredBlock(db: Database, blockID: BlockID): StoredBlock {
    const row = db.query(`
        SELECT id, content, properties
        FROM blocks
        WHERE id = $id
    `).get({ $id: blockID }) as { id: BlockID; content: string; properties: string } | null;

    if (!row) {
        throw new Error(`Block not found: ${blockID}`);
    }

    return {
        id: row.id,
        type: "block",
        content: row.content,
        properties: JSON.parse(row.properties) as Record<string, unknown>,
    };
}

/**
 * Updates one existing block row without changing its containment children.
 * @param db - The database containing the block
 * @param block - The block metadata and content to update
 */
export function updateStoredBlock(db: Database, block: StoredBlock): void {
    updateStoredBlocks(db, [block]);
}

/**
 * Updates multiple existing block rows atomically.
 * @param db - The database containing the blocks
 * @param blocks - The block rows to update
 */
export function updateStoredBlocks(db: Database, blocks: StoredBlock[]): void {
    if (blocks.length === 0) {
        return;
    }

    validateBlockBatch(blocks);
    const missingID = blocks.find((block) => !isStoredBlock(db, block.id))?.id;
    if (missingID) {
        throw new Error(`Block not found: ${missingID}`);
    }

    const update = db.transaction(() => {
        const statement = db.query(`
            UPDATE blocks
            SET content = $content,
                properties = $properties
            WHERE id = $id
        `);

        for (const block of blocks) {
            statement.run(blockParameters(block));
        }
    });

    update();
}

/**
 * Deletes one block row without deleting its graph node or containment subtree.
 * @param db - The database containing the block
 * @param blockID - The block ID to delete
 * @returns True if the block existed and was deleted
 */
export function deleteStoredBlock(db: Database, blockID: BlockID): boolean {
    return deleteStoredBlocks(db, [blockID]) > 0;
}

/**
 * Deletes block rows without deleting graph nodes or containment subtrees.
 * @param db - The database containing the blocks
 * @param blockIDs - The block IDs to delete
 * @returns The number of requested block IDs that existed
 */
export function deleteStoredBlocks(db: Database, blockIDs: BlockID[]): number {
    if (blockIDs.length === 0) {
        return 0;
    }

    const result = db.query(`
        DELETE FROM blocks
        WHERE id IN (SELECT value FROM json_each($ids))
    `).run({ $ids: JSON.stringify([...new Set(blockIDs)]) });

    return result.changes;
}

/**
 * Checks whether a block row exists.
 * @param db - The database to check
 * @param blockID - The block ID to check
 * @returns True if the block exists
 */
export function isStoredBlock(db: Database, blockID: BlockID): boolean {
    return db.query("SELECT 1 FROM blocks WHERE id = $id").get({ $id: blockID }) !== null;
}

/** Validates a block ID. */
function validateBlock(block: StoredBlock): void {
    if (!block.id.startsWith(`${BlockPrefix}_`)) {
        throw new Error(`Invalid block id: ${block.id}`);
    }
}

/** Validates block IDs and duplicate IDs within a batch. */
function validateBlockBatch(blocks: StoredBlock[]): void {
    const ids = new Set<BlockID>();
    for (const block of blocks) {
        validateBlock(block);
        if (ids.has(block.id)) {
            throw new Error(`Duplicate block id: ${block.id}`);
        }
        ids.add(block.id);
    }
}

/** Maps a stored block to SQLite named parameters. */
function blockParameters(block: StoredBlock): Record<string, string> {
    return {
        $id: block.id,
        $content: block.content,
        $properties: JSON.stringify(block.properties ?? {}),
    };
}

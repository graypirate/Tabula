import type { Database } from "bun:sqlite";

import type { Block, BlockID, BlockMetadata } from "../types/block";
import type { ObjID } from "../types/object";
import { BlockPrefix, ObjectPrefix } from "../utils/id";
import type { StoredObjectBlock } from "./types";

// MARK: -- Canonical Block Operations

/**
 * Inserts a new block into the database.
 * @param db - The database containing the block
 * @param block - The block to insert
 */
export function insertStoredBlock(db: Database, block: Block): void {
    validateBlock(block);

    if (isStoredBlock(db, block.id)) {
        throw new Error(`Block already exists: ${block.id}`);
    }

    db.query(`
        INSERT INTO blocks (id, content, properties)
        VALUES ($id, $content, $properties)
    `).run(blockParameters(block));
}

/**
 * Inserts a list of blocks into the database.
 * @param db - The database containing the blocks
 * @param blocks - The blocks to insert
 */
export function insertStoredBlocks(db: Database, blocks: Block[]): void {
    if (blocks.length === 0) {
        return;
    }

    const ids = validateBlockBatch(blocks);
    const existingIDs = selectExistingBlockIDs(db, ids);

    if (existingIDs.size > 0) {
        throw new Error(`Block already exists: ${existingIDs.values().next().value}`);
    }

    const insert = db.transaction(() => {
        const statement = db.query(`
            INSERT INTO blocks (id, content, properties)
            VALUES ($id, $content, $properties)
        `);

        for (const block of blocks) {
            statement.run(blockParameters(block));
        }
    });

    insert();
}

/**
 * Reads block metadata without its content.
 * @param db - The database containing the block
 * @param blockID - The ID of the block to read
 * @returns The metadata of the specified block
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
        properties: JSON.parse(row.properties) as Record<string, unknown>,
    };
}

/**
 * Reads one block by ID.
 * @param db - The database containing the block
 * @param blockID - The ID of the block to read
 * @returns The full block at the specified ID
 */
export function getStoredBlock(db: Database, blockID: BlockID): Block {
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
        content: row.content,
        properties: JSON.parse(row.properties) as Record<string, unknown>,
    };
}

/**
 * Updates an existing block.
 * @param db - The database containing the block
 * @param block - The block to update
 */
export function updateStoredBlock(db: Database, block: Block): void {
    updateStoredBlocks(db, [block]);
}

/**
 * Updates a list of existing blocks atomically.
 * @param db - The database containing the blocks
 * @param blocks - The blocks to update
 */
export function updateStoredBlocks(db: Database, blocks: Block[]): void {
    if (blocks.length === 0) {
        return;
    }

    const ids = validateBlockBatch(blocks);
    const existingIDs = selectExistingBlockIDs(db, ids);
    const missingID = blocks.find((block) => !existingIDs.has(block.id))?.id;

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
 * Deletes a canonical block and all of its object placements.
 * @param db - The database containing the block
 * @param blockID - The ID of the block to delete
 * @returns True if the block was successfully deleted
 */
export function deleteStoredBlock(db: Database, blockID: BlockID): boolean {
    return deleteStoredBlocks(db, [blockID]) > 0;
}

/**
 * Deletes canonical blocks and all of their object placements.
 * @param db - The database containing the blocks
 * @param blockIDs - The IDs of the blocks to delete
 * @returns The number of deleted canonical blocks
 */
export function deleteStoredBlocks(db: Database, blockIDs: BlockID[]): number {
    const ids = [...new Set(blockIDs)];

    if (ids.length === 0) {
        return 0;
    }

    const remove = db.transaction(() => {
        const matchedIDs = selectExistingBlockIDs(db, ids);

        db.query(`
            DELETE FROM blocks
            WHERE id IN (SELECT value FROM json_each($ids))
        `).run({ $ids: JSON.stringify(ids) });

        return matchedIDs.size;
    });

    return remove();
}

/**
 * Checks whether a block exists.
 * @param db - The database to check
 * @param blockID - The block ID to check
 * @returns True if the block exists
 */
export function isStoredBlock(db: Database, blockID: BlockID): boolean {
    return db.query("SELECT 1 FROM blocks WHERE id = $id").get({ $id: blockID }) !== null;
}

// MARK: -- Object Block Operations

/**
 * Inserts one block placement into an object.
 * @param db - The database containing the placement
 * @param objectID - The object receiving the block
 * @param blockID - The canonical block to place
 * @param parentBlockID - The optional parent block placement
 * @param position - The block's sibling position
 */
export function insertBlockPlacement(db: Database, objectID: ObjID, blockID: BlockID, parentBlockID: BlockID | undefined, position: number): void {
    insertBlockPlacements(db, objectID, [{ id: blockID, parentBlockID, position }]);
}

/**
 * Inserts block placements into an object atomically.
 * @param db - The database containing the placements
 * @param objectID - The object receiving the blocks
 * @param blocks - The block placements to insert
 */
export function insertBlockPlacements(db: Database, objectID: ObjID, blocks: { id: BlockID; parentBlockID?: BlockID; position: number }[]): void {
    if (blocks.length === 0) {
        validateObject(db, objectID);
        return;
    }

    validateObject(db, objectID);
    const placements = getStoredPlacements(db, objectID);
    const incoming = validateObjectBlockPlacementBatch(blocks);

    for (const blockID of incoming.keys()) {
        if (placements.has(blockID)) {
            throw new Error(`Block ${blockID} is already placed in object ${objectID}`);
        }
    }

    validateCanonicalBlocksExist(db, incoming.keys());
    const finalPlacements = new Map([...placements, ...incoming]);
    validateObjectBlockPlacementTree(objectID, finalPlacements);

    const insert = db.transaction(() => {
        const statement = db.query(`
            INSERT INTO object_blocks (object_id, block_id, parent_block_id, position)
            VALUES ($objectID, $blockID, $parentID, $position)
        `);

        for (const placement of orderParentBeforeChild(incoming)) {
            statement.run(placementParameters(objectID, placement));
        }
    });

    insert();
}

/**
 * Updates one block placement in an object.
 * @param db - The database containing the placement
 * @param objectID - The object containing the block
 * @param blockID - The canonical block being placed
 * @param parentBlockID - The optional parent block placement
 * @param position - The block's sibling position
 */
export function updateBlockPlacement(db: Database, objectID: ObjID, blockID: BlockID, parentBlockID: BlockID | undefined, position: number): void {
    updateBlockPlacements(db, objectID, [{ id: blockID, parentBlockID, position }]);
}

/**
 * Updates block placements in an object atomically.
 * @param db - The database containing the placements
 * @param objectID - The object containing the blocks
 * @param blocks - The block placements to update
 */
export function updateBlockPlacements(db: Database, objectID: ObjID, blocks: { id: BlockID; parentBlockID?: BlockID; position: number }[]): void {
    if (blocks.length === 0) {
        validateObject(db, objectID);
        return;
    }

    validateObject(db, objectID);
    const placements = getStoredPlacements(db, objectID);
    const updates = validateObjectBlockPlacementBatch(blocks);
    const missingID = blocks.find((block) => !placements.has(block.id))?.id;

    if (missingID) {
        throw new Error(`Block ${missingID} is not placed in object ${objectID}`);
    }

    const finalPlacements = new Map(placements);
    for (const [blockID, placement] of updates) {
        finalPlacements.set(blockID, placement);
    }
    validateObjectBlockPlacementTree(objectID, finalPlacements);

    const update = db.transaction(() => {
        vacatePlacementPositions(db, objectID, [...updates.keys()], [...updates.values()].map((placement) => placement.position));
        const statement = db.query(`
            UPDATE object_blocks
            SET parent_block_id = $parentID,
                position = $position
            WHERE object_id = $objectID
              AND block_id = $blockID
        `);

        for (const placement of orderParentBeforeChild(updates)) {
            statement.run(placementParameters(objectID, placement));
        }
    });

    update();
}

/**
 * Reads an object's complete compiled block tree.
 * @param db - The database containing the object
 * @param objectID - The object whose blocks should be read
 * @returns The object's blocks in deterministic depth-first preorder
 */
export function getBlockPlacements(db: Database, objectID: ObjID): StoredObjectBlock[] {
    validateObject(db, objectID);
    const rows = db.query(`
        WITH RECURSIVE placements(blockID, parentBlockID, position, path) AS (
            SELECT
                block_id,
                parent_block_id,
                position,
                printf('%020d', position)
            FROM object_blocks
            WHERE object_id = $objectID
              AND parent_block_id IS NULL

            UNION ALL

            SELECT
                child.block_id,
                child.parent_block_id,
                child.position,
                placements.path || '.' || printf('%020d', child.position)
            FROM object_blocks AS child
            JOIN placements ON child.parent_block_id = placements.blockID
            WHERE child.object_id = $objectID
        )
        SELECT
            blocks.id,
            blocks.content,
            blocks.properties,
            placements.parentBlockID,
            placements.position
        FROM placements
        JOIN blocks ON blocks.id = placements.blockID
        ORDER BY placements.path
    `).all({ $objectID: objectID }) as {
        id: BlockID;
        content: string;
        properties: string;
        parentBlockID: BlockID | null;
        position: number;
    }[];

    return rows.map((row) => ({
        id: row.id,
        content: row.content,
        properties: JSON.parse(row.properties) as Record<string, unknown>,
        parentBlockID: row.parentBlockID ?? undefined,
        position: row.position,
    }));
}

/**
 * Deletes one block placement and its placement descendants.
 * @param db - The database containing the placement
 * @param objectID - The object containing the placement
 * @param blockID - The placed block to remove
 * @returns True if the placement was successfully deleted
 */
export function deleteBlockPlacement(db: Database, objectID: ObjID, blockID: BlockID): boolean {
    return deleteBlockPlacements(db, objectID, [blockID]) > 0;
}

/**
 * Deletes block placement subtrees from an object.
 * @param db - The database containing the placements
 * @param objectID - The object containing the placements
 * @param blockIDs - The placement roots to remove
 * @returns The number of explicitly deleted placement roots
 */
export function deleteBlockPlacements(db: Database, objectID: ObjID, blockIDs: BlockID[]): number {
    validateObject(db, objectID);
    const ids = [...new Set(blockIDs)];

    if (ids.length === 0) {
        return 0;
    }

    const remove = db.transaction(() => {
        const matchedIDs = selectExistingObjectBlockIDs(db, objectID, ids);

        db.query(`
            DELETE FROM object_blocks
            WHERE object_id = $objectID
              AND block_id IN (SELECT value FROM json_each($ids))
        `).run({
            $objectID: objectID,
            $ids: JSON.stringify(ids),
        });

        return matchedIDs.size;
    });

    return remove();
}

/**
 * Synchronizes the complete block compilation belonging to an object.
 * @param db - The database containing the blocks
 * @param objectID - The object whose blocks should be synchronized
 * @param blocks - The complete desired block compilation
 */
export function syncBlockPlacements(db: Database, objectID: ObjID, blocks: StoredObjectBlock[]): void {
    validateObject(db, objectID);
    const desiredPlacements = validateObjectBlockPlacementBatch(blocks);
    validateObjectBlockPlacementTree(objectID, desiredPlacements);
    const canonicalIDs = selectExistingBlockIDs(db, desiredPlacements.keys());

    const sync = db.transaction(() => {
        const insertBlockStatement = db.query(`
            INSERT INTO blocks (id, content, properties)
            VALUES ($id, $content, $properties)
        `);
        const updateBlockStatement = db.query(`
            UPDATE blocks
            SET content = $content,
                properties = $properties
            WHERE id = $id
        `);

        for (const block of blocks) {
            validateBlock(block);
            if (canonicalIDs.has(block.id)) {
                updateBlockStatement.run(blockParameters(block));
            } else {
                insertBlockStatement.run(blockParameters(block));
            }
        }

        const storedPlacements = getStoredPlacements(db, objectID);
        vacatePlacementPositions(db, objectID, [...storedPlacements.keys()], [...desiredPlacements.values()].map((placement) => placement.position));

        const insertPlacement = db.query(`
            INSERT INTO object_blocks (object_id, block_id, parent_block_id, position)
            VALUES ($objectID, $blockID, $parentID, $position)
        `);
        const updatePlacement = db.query(`
            UPDATE object_blocks
            SET parent_block_id = $parentID,
                position = $position
            WHERE object_id = $objectID
              AND block_id = $blockID
        `);

        for (const placement of orderParentBeforeChild(desiredPlacements)) {
            if (storedPlacements.has(placement.id)) {
                updatePlacement.run(placementParameters(objectID, placement));
            } else {
                insertPlacement.run(placementParameters(objectID, placement));
            }
        }

        const omittedIDs = [...storedPlacements.keys()].filter((blockID) => !desiredPlacements.has(blockID));
        if (omittedIDs.length > 0) {
            db.query(`
                DELETE FROM object_blocks
                WHERE object_id = $objectID
                  AND block_id IN (SELECT value FROM json_each($ids))
            `).run({
                $objectID: objectID,
                $ids: JSON.stringify(omittedIDs),
            });
        }
    });

    sync();
}

// MARK: -- Internal Validation Helpers

/** Validates a canonical block. */
function validateBlock(block: Block): void {
    if (!block.id.startsWith(`${BlockPrefix}_`)) {
        throw new Error(`Invalid block id: ${block.id}`);
    }
}

/** Validates a canonical block batch and returns its unique IDs. */
function validateBlockBatch(blocks: Block[]): Set<BlockID> {
    const ids = new Set<BlockID>();

    for (const block of blocks) {
        validateBlock(block);
        if (ids.has(block.id)) {
            throw new Error(`Duplicate block id: ${block.id}`);
        }
        ids.add(block.id);
    }

    return ids;
}

/** Validates and indexes a placement batch. */
function validateObjectBlockPlacementBatch(
    blocks: { id: BlockID; parentBlockID?: BlockID; position: number }[]
): Map<BlockID, { id: BlockID; parentBlockID?: BlockID; position: number }> {
    const placements = new Map<BlockID, { id: BlockID; parentBlockID?: BlockID; position: number }>();

    for (const block of blocks) {
        if (!block.id.startsWith(`${BlockPrefix}_`)) {
            throw new Error(`Invalid block id: ${block.id}`);
        }
        if (block.parentBlockID !== undefined && !block.parentBlockID.startsWith(`${BlockPrefix}_`)) {
            throw new Error(`Invalid parent block id: ${block.parentBlockID}`);
        }
        if (block.id === block.parentBlockID) {
            throw new Error(`Block ${block.id} cannot parent itself`);
        }
        if (!Number.isSafeInteger(block.position) || block.position < 0) {
            throw new Error(`Invalid block position: ${block.position}`);
        }
        if (placements.has(block.id)) {
            throw new Error(`Duplicate block placement: ${block.id}`);
        }
        placements.set(block.id, block);
    }

    return placements;
}

/** Validates a complete object placement tree. */
function validateObjectBlockPlacementTree(objectID: ObjID, placements: Map<BlockID, { id: BlockID; parentBlockID?: BlockID; position: number }>): void {
    const siblingPositions = new Map<string, Set<number>>();

    for (const placement of placements.values()) {
        if (placement.parentBlockID !== undefined && !placements.has(placement.parentBlockID)) {
            throw new Error(`Parent block ${placement.parentBlockID} is not placed in object ${objectID}`);
        }

        const parentKey = placement.parentBlockID ?? objectID;
        const positions = siblingPositions.get(parentKey) ?? new Set<number>();
        if (positions.has(placement.position)) {
            throw new Error(`Block position ${placement.position} is occupied for parent ${parentKey}`);
        }
        positions.add(placement.position);
        siblingPositions.set(parentKey, positions);
    }

    for (const placement of placements.values()) {
        const visited = new Set<BlockID>([placement.id]);
        let parentBlockID = placement.parentBlockID;

        while (parentBlockID !== undefined) {
            if (visited.has(parentBlockID)) {
                throw new Error(`Block cycle detected at ${parentBlockID}`);
            }
            visited.add(parentBlockID);
            parentBlockID = placements.get(parentBlockID)?.parentBlockID;
        }
    }
}

/** Validates that an object exists. */
function validateObject(db: Database, objectID: ObjID): void {
    if (!objectID.startsWith(`${ObjectPrefix}_`)) {
        throw new Error(`Invalid object id: ${objectID}`);
    }

    if (!db.query("SELECT 1 FROM objects WHERE id = $id").get({ $id: objectID })) {
        throw new Error(`Object not found: ${objectID}`);
    }
}

/** Validates that canonical blocks exist. */
function validateCanonicalBlocksExist(db: Database, blockIDs: Iterable<BlockID>): void {
    const ids = [...blockIDs];
    const existingIDs = selectExistingBlockIDs(db, ids);
    const missingID = ids.find((blockID) => !existingIDs.has(blockID));

    if (missingID) {
        throw new Error(`Block not found: ${missingID}`);
    }
}

// MARK: -- Internal Action Helpers

/** Reads all stored placements for an object. */
function getStoredPlacements(db: Database, objectID: ObjID): Map<BlockID, { id: BlockID; parentBlockID?: BlockID; position: number }> {
    const rows = db.query(`
        SELECT
            block_id AS id,
            parent_block_id AS parentBlockID,
            position
        FROM object_blocks
        WHERE object_id = $objectID
    `).all({ $objectID: objectID }) as { id: BlockID; parentBlockID: BlockID | null; position: number }[];

    return new Map(rows.map((row) => [
        row.id,
        {
            id: row.id,
            parentBlockID: row.parentBlockID ?? undefined,
            position: row.position,
        },
    ]));
}

/** Orders placements so every parent precedes its children. */
function orderParentBeforeChild<T extends { id: BlockID; parentBlockID?: BlockID }>(placements: Map<BlockID, T>): T[] {
    const childrenByParent = new Map<BlockID, T[]>();
    const ready: T[] = [];
    const ordered: T[] = [];

    for (const placement of placements.values()) {
        if (placement.parentBlockID === undefined || !placements.has(placement.parentBlockID)) {
            ready.push(placement);
            continue;
        }

        const children = childrenByParent.get(placement.parentBlockID) ?? [];
        children.push(placement);
        childrenByParent.set(placement.parentBlockID, children);
    }

    for (let index = 0; index < ready.length; index++) {
        const placement = ready[index]!;
        ordered.push(placement);
        ready.push(...(childrenByParent.get(placement.id) ?? []));
    }

    return ordered;
}

/** Returns the requested block IDs that already exist. */
function selectExistingBlockIDs(db: Database, blockIDs: Iterable<BlockID>): Set<BlockID> {
    const ids = [...blockIDs];
    if (ids.length === 0) {
        return new Set();
    }

    const rows = db.query(`
        SELECT id
        FROM blocks
        WHERE id IN (SELECT value FROM json_each($ids))
    `).all({ $ids: JSON.stringify(ids) }) as { id: BlockID }[];

    return new Set(rows.map((row) => row.id));
}

/** Returns the requested block IDs placed in an object. */
function selectExistingObjectBlockIDs(db: Database, objectID: ObjID, blockIDs: Iterable<BlockID>): Set<BlockID> {
    const ids = [...blockIDs];
    if (ids.length === 0) {
        return new Set();
    }

    const rows = db.query(`
        SELECT block_id AS id
        FROM object_blocks
        WHERE object_id = $objectID
          AND block_id IN (SELECT value FROM json_each($ids))
    `).all({
        $objectID: objectID,
        $ids: JSON.stringify(ids),
    }) as { id: BlockID }[];

    return new Set(rows.map((row) => row.id));
}

/** Moves placements out of the unique sibling-position range before a batch reorder. */
function vacatePlacementPositions(db: Database, objectID: ObjID, blockIDs: BlockID[], desiredPositions: number[]): void {
    if (blockIDs.length === 0) {
        return;
    }

    const row = db.query(`
        SELECT COALESCE(MAX(position), -1) AS maxPosition
        FROM object_blocks
        WHERE object_id = $objectID
    `).get({ $objectID: objectID }) as { maxPosition: number };
    const desiredMaxPosition = desiredPositions.length > 0 ? Math.max(...desiredPositions) : -1;

    db.query(`
        UPDATE object_blocks
        SET position = position + $offset
        WHERE object_id = $objectID
          AND block_id IN (SELECT value FROM json_each($ids))
    `).run({
        $objectID: objectID,
        $offset: Math.max(row.maxPosition, desiredMaxPosition) + 1,
        $ids: JSON.stringify(blockIDs),
    });
}

/** Maps a canonical block to named SQLite parameters. */
function blockParameters(block: Block): Record<string, string> {
    return {
        $id: block.id,
        $content: block.content,
        $properties: JSON.stringify(block.properties ?? {}),
    };
}

/** Maps a block placement to named SQLite parameters. */
function placementParameters(objectID: ObjID, placement: { id: BlockID; parentBlockID?: BlockID; position: number }): Record<string, string | number | null> {
    return {
        $objectID: objectID,
        $blockID: placement.id,
        $parentID: placement.parentBlockID ?? null,
        $position: placement.position,
    };
}

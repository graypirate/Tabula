import type { Database } from "bun:sqlite";

import type { Block, BlockID, BlockMetadata } from "../types/block";
import type { ObjID } from "../types/object";
import { BlockPrefix, ObjectPrefix } from "../utils/id";

type BlockParentID = ObjID | BlockID;

type BlockMetadataRow = {
    id: string;
    parentID: string;
    position: number;
    properties: string;
};

type BlockRow = BlockMetadataRow & {
    content: string;
};

/**
 * Inserts a new block.
 * @param db - The database containing the block
 * @param block - The block to insert
 */
export function insertBlock(db: Database, block: Block): void {
    validateInsertBlock(db, block);
    db.query(`
        INSERT INTO blocks (id, parent_id, position, content, properties)
        VALUES ($id, $parentID, $position, $content, $properties)
    `).run(mapBlockParameters(block));
}

/**
 * Inserts a list of blocks.
 * @param db - The database containing the blocks
 * @param blocks - The blocks to insert
 */
export function insertBlocks(db: Database, blocks: Block[]): void {
    if (blocks.length === 0) {
        return;
    }

    const ordered = validateInsertBlocks(db, blocks);
    const insert = db.transaction(() => {
        const statement = db.query(`
            INSERT INTO blocks (id, parent_id, position, content, properties)
            VALUES ($id, $parentID, $position, $content, $properties)
        `);

        for (const block of ordered) {
            statement.run(mapBlockParameters(block));
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
        SELECT
            id,
            parent_id AS parentID,
            position,
            properties
        FROM blocks
        WHERE id = $id
    `).get({ $id: blockID }) as BlockMetadataRow | null;

    if (!row) {
        throw new Error(`Block not found: ${blockID}`);
    }

    return mapToBlockMetadata(row);
}

/**
 * Reads one block by ID.
 * @param db - The database containing the block
 * @param blockID - The ID of the block to read
 * @returns The full block at the specified ID
 */
export function getBlock(db: Database, blockID: BlockID): Block {
    const row = db.query(`
        SELECT
            id,
            parent_id AS parentID,
            position,
            content,
            properties
        FROM blocks
        WHERE id = $id
    `).get({ $id: blockID }) as BlockRow | null;

    if (!row) {
        throw new Error(`Block not found: ${blockID}`);
    }

    return mapToBlock(row);
}

/**
 * Reads all blocks belonging directly to a parent in canonical order.
 * @param db - The database containing the blocks
 * @param parentID - The ID of the block parent
 * @returns The parent's direct blocks ordered by position
 */
export function getBlocks(db: Database, parentID: BlockParentID): Block[] {
    const rows = db.query(`
        SELECT
            id,
            parent_id AS parentID,
            position,
            content,
            properties
        FROM blocks
        WHERE parent_id = $parentID
        ORDER BY position
    `).all({ $parentID: parentID }) as BlockRow[];

    return rows.map(mapToBlock);
}

/**
 * Reads every descendant block in deterministic depth-first preorder of a parent.
 * @param db - The database containing the blocks
 * @param parentID - The ID of the root parent
 * @returns Every descendant block in depth-first preorder
 */
export function getDescendantBlocks(db: Database, parentID: BlockParentID): Block[] {
    const rows = db.query(`
        WITH RECURSIVE descendants(id, parentID, position, content, properties, path) AS (
            SELECT
                id,
                parent_id,
                position,
                content,
                properties,
                printf('%020d', position)
            FROM blocks
            WHERE parent_id = $parentID

            UNION ALL

            SELECT
                child.id,
                child.parent_id,
                child.position,
                child.content,
                child.properties,
                descendants.path || '.' || printf('%020d', child.position)
            FROM blocks AS child
            JOIN descendants ON child.parent_id = descendants.id
        )
        SELECT id, parentID, position, content, properties
        FROM descendants
        ORDER BY path
    `).all({ $parentID: parentID }) as BlockRow[];

    return rows.map(mapToBlock);
}

/**
 * Updates an existing block.
 * @param db - The database containing the block
 * @param block - The block to update
 */
export function updateBlock(db: Database, block: Block): void {
    updateBlocks(db, [block]);
}

/**
 * Updates a list of existing blocks atomically.
 * @param db - The database containing the blocks
 * @param blocks - The blocks to update
 */
export function updateBlocks(db: Database, blocks: Block[]): void {
    if (blocks.length === 0) {
        return;
    }

    validateUpdateBlocks(db, blocks);

    const update = db.transaction(() => {
        vacateBlockPositions(db, blocks.map((block) => block.id));

        const statement = db.query(`
            UPDATE blocks
            SET parent_id = $parentID,
                position = $position,
                content = $content,
                properties = $properties
            WHERE id = $id
        `);

        for (const block of blocks) {
            statement.run(mapBlockParameters(block));
        }
    });

    update();
}

/**
 * Deletes a block and all of its descendants.
 * @param db - The database containing the block
 * @param blockID - The ID of the block to delete
 * @returns True if the block was successfully deleted
 */
export function deleteBlock(db: Database, blockID: BlockID): boolean {
    return deleteBlocks(db, [blockID]) > 0;
}

/**
 * Deletes blocks and all of their descendants.
 * @param db - The database containing the blocks
 * @param blockIDs - The IDs of the blocks to delete
 * @returns The number of deleted blocks
 */
export function deleteBlocks(db: Database, blockIDs: BlockID[]): number {
    const uniqueIDs = [...new Set(blockIDs)];

    if (uniqueIDs.length === 0) {
        return 0;
    }

    const result = db.query(`
        WITH RECURSIVE descendants(id) AS (
            SELECT id
            FROM blocks
            WHERE id IN (SELECT value FROM json_each($ids))

            UNION

            SELECT child.id
            FROM blocks AS child
            JOIN descendants ON child.parent_id = descendants.id
        )
        DELETE FROM blocks
        WHERE id IN (SELECT id FROM descendants)
    `).run({ $ids: JSON.stringify(uniqueIDs) });

    return result.changes;
}

/**
 * Checks whether a block exists.
 * @param db - The database to check
 * @param blockID - The block ID to check
 * @returns True if the block exists
 */
export function isBlock(db: Database, blockID: BlockID): boolean {
    return db.query("SELECT 1 FROM blocks WHERE id = $id").get({ $id: blockID }) !== null;
}

/**
 * Synchronizes the complete block subtree belonging to an object.
 * @param db - The database containing the blocks
 * @param objectID - The object whose blocks should be synchronized
 * @param blocks - The complete desired block subtree
 */
export function syncObjectBlocks(db: Database, objectID: ObjID, blocks: Block[]): void {
    const ordered = validateObjectBlockTree(db, objectID, blocks);
    const existing = getDescendantBlocks(db, objectID);
    const existingIDs = new Set(existing.map((block) => block.id));
    const desiredIDs = new Set(blocks.map((block) => block.id));
    const candidateIDs = blocks
        .map((block) => block.id)
        .filter((blockID) => !existingIDs.has(blockID));
    const occupiedIDs = selectExistingBlockIDs(db, candidateIDs);
    const foreignID = candidateIDs.find((blockID) => occupiedIDs.has(blockID));

    if (foreignID) {
        throw new Error(`Block ${foreignID} belongs to another object`);
    }

    if (existing.length === 0 && blocks.length === 0) {
        return;
    }

    const sync = db.transaction(() => {
        vacateBlockPositions(db, existing.map((block) => block.id));

        const update = db.query(`
            UPDATE blocks
            SET parent_id = $parentID,
                position = $position,
                content = $content,
                properties = $properties
            WHERE id = $id
        `);
        const insert = db.query(`
            INSERT INTO blocks (id, parent_id, position, content, properties)
            VALUES ($id, $parentID, $position, $content, $properties)
        `);

        for (const block of ordered) {
            if (existingIDs.has(block.id)) {
                update.run(mapBlockParameters(block));
            } else {
                insert.run(mapBlockParameters(block));
            }
        }

        const omittedIDs = existing.filter((block) => !desiredIDs.has(block.id)).map((block) => block.id);
        if (omittedIDs.length > 0) {
            deleteBlocks(db, omittedIDs);
        }
    });

    sync();
}

// MARK: -- Internal Validation Helpers

/** Validates a block before inserting it. */
function validateInsertBlock(db: Database, block: Block): void {
    validateBlockShape(block);

    if (isBlock(db, block.id)) {
        throw new Error(`Block already exists: ${block.id}`);
    }

    validateParent(db, block.parentID);
    validateSiblingPositions(db, [block], new Set());
}

/** Validates and orders a batch of blocks before insertion. */
function validateInsertBlocks(db: Database, blocks: Block[]): Block[] {
    const byID = indexBlocks(blocks);
    const ids = new Set(byID.keys());
    const existingIDs = selectExistingBlockIDs(db, ids);

    for (const block of blocks) {
        if (existingIDs.has(block.id)) {
            throw new Error(`Block already exists: ${block.id}`);
        }
    }

    validateExternalParents(db, blocks, byID);
    validateSiblingPositions(db, blocks, ids);
    return orderParentBeforeChild(blocks, byID);
}

/** Validates a batch of existing blocks before updating them. */
function validateUpdateBlocks(db: Database, blocks: Block[]): void {
    const byID = indexBlocks(blocks);
    const ids = new Set(byID.keys());
    const existingIDs = selectExistingBlockIDs(db, ids);
    const storedParents = new Map<BlockID, BlockParentID>();
    const validatedObjectIDs = new Set<ObjID>();

    for (const block of blocks) {
        if (!existingIDs.has(block.id)) {
            throw new Error(`Block not found: ${block.id}`);
        }

        validateUpdatedBlockCycle(db, block.id, byID, storedParents, validatedObjectIDs);
    }

    validateSiblingPositions(db, blocks, ids);
}

/** Validates that blocks form a complete subtree owned by the specified object. */
function validateObjectBlockTree(db: Database, objectID: ObjID, blocks: Block[]): Block[] {
    validateObjectParent(db, objectID);
    const byID = indexBlocks(blocks);

    for (const block of blocks) {
        if (block.parentID.startsWith(`${BlockPrefix}_`) && !byID.has(block.parentID)) {
            throw new Error(`Block ${block.id} has a parent outside object ${objectID}`);
        }

        if (block.parentID.startsWith(`${ObjectPrefix}_`) && block.parentID !== objectID) {
            throw new Error(`Block ${block.id} does not belong to object ${objectID}`);
        }
    }

    return orderParentBeforeChild(blocks, byID);
}

/** Validates a block's ID, parent type, and position. */
function validateBlockShape(block: Block): void {
    if (!block.id.startsWith(`${BlockPrefix}_`)) {
        throw new Error(`Invalid block id: ${block.id}`);
    }

    if (block.id === block.parentID) {
        throw new Error(`Block ${block.id} cannot parent itself`);
    }

    if (!block.parentID.startsWith(`${ObjectPrefix}_`) && !block.parentID.startsWith(`${BlockPrefix}_`)) {
        throw new Error(`Block parent must be an object or block: ${block.parentID}`);
    }

    if (block.position < 0 || !Number.isSafeInteger(block.position)) {
        throw new Error(`Invalid block position: ${block.position}`);
    }
}

/** Validates block shapes and indexes unique IDs and sibling positions. */
function indexBlocks(blocks: Block[]): Map<string, Block> {
    const byID = new Map<string, Block>();
    const positionsByParent = new Map<string, Set<number>>();

    for (const block of blocks) {
        validateBlockShape(block);

        if (byID.has(block.id)) {
            throw new Error(`Duplicate block id: ${block.id}`);
        }

        const siblingPositions = positionsByParent.get(block.parentID) ?? new Set<number>();
        if (siblingPositions.has(block.position)) {
            throw new Error(`Duplicate block position ${block.position} for parent ${block.parentID}`);
        }

        siblingPositions.add(block.position);
        positionsByParent.set(block.parentID, siblingPositions);
        byID.set(block.id, block);
    }

    return byID;
}

/** Validates external parents referenced by a block batch. */
function validateExternalParents(db: Database, blocks: Block[], byID: Map<string, Block>): void {
    const parentIDs = new Set(
        blocks
            .map((block) => block.parentID)
            .filter((parentID) => !byID.has(parentID)),
    );

    for (const parentID of parentIDs) {
        validateParent(db, parentID);
    }
}

/** Validates that requested sibling positions are available. */
function validateSiblingPositions(db: Database, blocks: Block[], ignoredIDs: Set<string>): void {
    if (blocks.length === 0) {
        return;
    }

    const positions = blocks.map((block) => ({
        parentID: block.parentID,
        position: block.position,
    }));
    const rows = db.query(`
        SELECT
            blocks.id,
            blocks.parent_id AS parentID,
            blocks.position
        FROM blocks
        JOIN json_each($positions) AS requested
          ON blocks.parent_id = json_extract(requested.value, '$.parentID')
         AND blocks.position = json_extract(requested.value, '$.position')
    `).all({ $positions: JSON.stringify(positions) }) as {
        id: BlockID;
        parentID: BlockParentID;
        position: number;
    }[];
    const occupiedByParent = new Map<string, Map<number, BlockID>>();

    for (const row of rows) {
        const occupiedPositions = occupiedByParent.get(row.parentID) ?? new Map<number, BlockID>();
        occupiedPositions.set(row.position, row.id);
        occupiedByParent.set(row.parentID, occupiedPositions);
    }

    for (const block of blocks) {
        const occupiedID = occupiedByParent.get(block.parentID)?.get(block.position);
        if (occupiedID && !ignoredIDs.has(occupiedID)) {
            throw new Error(`Block position ${block.position} is occupied for parent ${block.parentID}`);
        }
    }
}

/** Validates that updating a block's parent does not create a cycle. */
function validateUpdatedBlockCycle(
    db: Database,
    blockID: BlockID,
    updates: Map<string, Block>,
    storedParents: Map<BlockID, BlockParentID>,
    validatedObjectIDs: Set<ObjID>,
): void {
    const visited = new Set<string>([blockID]);
    let parentID: string = updates.get(blockID)!.parentID;

    while (parentID.startsWith(`${BlockPrefix}_`)) {
        if (visited.has(parentID)) {
            throw new Error(`Block cycle detected at ${parentID}`);
        }

        visited.add(parentID);
        const updatedParent = updates.get(parentID);

        if (updatedParent) {
            parentID = updatedParent.parentID;
            continue;
        }

        let storedParent = storedParents.get(parentID);
        if (!storedParent) {
            const row = db.query("SELECT parent_id AS parentID FROM blocks WHERE id = $id").get({ $id: parentID }) as { parentID: BlockParentID } | null;

            if (!row) {
                throw new Error(`Block parent not found: ${parentID}`);
            }

            storedParent = row.parentID;
            storedParents.set(parentID, storedParent);
        }

        parentID = storedParent;
    }

    if (!parentID.startsWith(`${ObjectPrefix}_`)) {
        throw new Error(`Block parent must be an object or block: ${parentID}`);
    }

    if (!validatedObjectIDs.has(parentID)) {
        validateObjectParent(db, parentID);
        validatedObjectIDs.add(parentID);
    }
}

/** Validates that a block's parent is an existing object or block. */
function validateParent(db: Database, parentID: string): void {
    if (parentID.startsWith(`${ObjectPrefix}_`)) {
        validateObjectParent(db, parentID);
        return;
    }

    if (parentID.startsWith(`${BlockPrefix}_`)) {
        if (!db.query("SELECT 1 FROM blocks WHERE id = $id").get({ $id: parentID })) {
            throw new Error(`Block parent not found: ${parentID}`);
        }
        return;
    }

    throw new Error(`Block parent must be an object or block: ${parentID}`);
}

/** Validates that an object parent exists. */
function validateObjectParent(db: Database, objectID: ObjID): void {
    if (!objectID.startsWith(`${ObjectPrefix}_`)) {
        throw new Error(`Invalid object id: ${objectID}`);
    }

    if (!db.query("SELECT 1 FROM objects WHERE id = $id").get({ $id: objectID })) {
        throw new Error(`Object parent not found: ${objectID}`);
    }
}

// MARK: -- Internal Action Helpers

/** Orders blocks so every parent precedes its children. */
function orderParentBeforeChild(blocks: Block[], byID: Map<string, Block>): Block[] {
    const childrenByParent = new Map<string, Block[]>();
    const ready: Block[] = [];
    const ordered: Block[] = [];

    for (const block of blocks) {
        if (!byID.has(block.parentID)) {
            ready.push(block);
            continue;
        }

        const children = childrenByParent.get(block.parentID) ?? [];
        children.push(block);
        childrenByParent.set(block.parentID, children);
    }

    for (let index = 0; index < ready.length; index++) {
        const block = ready[index]!;
        ordered.push(block);

        for (const child of childrenByParent.get(block.id) ?? []) {
            ready.push(child);
        }
    }

    if (ordered.length !== blocks.length) {
        const orderedIDs = new Set(ordered.map((block) => block.id));
        const cycleID = blocks.find((block) => !orderedIDs.has(block.id))!.id;
        throw new Error(`Block cycle detected at ${cycleID}`);
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

/** Moves blocks out of the unique sibling-position range before a batch reorder. */
function vacateBlockPositions(db: Database, blockIDs: BlockID[]): void {
    if (blockIDs.length === 0) {
        return;
    }

    const row = db.query("SELECT COALESCE(MAX(position), -1) AS maxPosition FROM blocks").get() as { maxPosition: number };
    db.query(`
        UPDATE blocks
        SET position = position + $offset
        WHERE id IN (SELECT value FROM json_each($ids))
    `).run({
        $offset: row.maxPosition + 1,
        $ids: JSON.stringify(blockIDs),
    });
}

/** Maps a block to named SQLite parameters. */
function mapBlockParameters(block: Block): Record<string, string | number> {
    return {
        $id: block.id,
        $parentID: block.parentID,
        $position: block.position,
        $content: block.content,
        $properties: JSON.stringify(block.properties ?? {}),
    };
}

/** Maps a SQLite block row to canonical block metadata. */
function mapToBlockMetadata(row: BlockMetadataRow): BlockMetadata {
    return {
        id: row.id,
        parentID: row.parentID,
        position: row.position,
        properties: JSON.parse(row.properties) as Record<string, unknown>,
    };
}

/** Maps a SQLite block row to a canonical block. */
function mapToBlock(row: BlockRow): Block {
    return {
        ...mapToBlockMetadata(row),
        content: row.content,
    };
}

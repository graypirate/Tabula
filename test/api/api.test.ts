import { afterEach, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    createBlock,
    createObject,
    createSilo,
    deleteSilo,
    initializeDatabase,
    listBlock,
    listDatabase,
    listObject,
    listSilo,
    openDatabase,
    readBlock,
    readDatabase,
    readObject,
    readSilo,
    search,
    writeBlock,
    writeObject,
} from "../../API";
import type { ObjectWrite } from "../../API";

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

test("initializes and opens an existing database", () => {
    tempDirectory = mkdtempSync(join(tmpdir(), "agentdb-api-"));
    const path = join(tempDirectory, "workspace.sqlite");
    const missing = join(tempDirectory, "missing.sqlite");

    expect(() => openDatabase(missing)).toThrow();
    expect(existsSync(missing)).toBe(false);

    db = initializeDatabase(path, "Workspace");
    const metadata = readDatabase(db);
    expect(metadata.name).toBe("Workspace");
    db.close();

    db = openDatabase(path);
    expect(readDatabase(db)).toEqual(metadata);
});

test("quick create functions generate IDs and return existing domain types", () => {
    db = initializeDatabase(":memory:");
    const databaseID = readDatabase(db).id;
    const silo = createSilo(db, databaseID, "Projects", { active: true });
    const object = createObject(db, silo.id, "AgentDB");
    const block = createBlock(db, "Standalone", { kind: "text" });

    expect(silo).toEqual({
        id: expect.stringMatching(/^s_/),
        parentID: databaseID,
        name: "Projects",
        properties: { active: true },
    });
    expect(object).toEqual({
        id: expect.stringMatching(/^o_/),
        parentID: silo.id,
        name: "AgentDB",
        properties: {},
        blocks: [],
    });
    expect(block).toEqual({
        id: expect.stringMatching(/^b_/),
        content: "Standalone",
        properties: { kind: "text" },
    });
    expect(readSilo(db, silo.id)).toEqual(silo);
    expect(readObject(db, object.id)).toEqual(object);
    expect(readBlock(db, block.id)).toEqual(block);
});

test("writeBlock creates without an ID and updates with an ID", () => {
    db = initializeDatabase(":memory:");

    const created = writeBlock(db, {
        content: "Created",
        properties: { version: 1 },
    });
    const updated = writeBlock(db, {
        id: created.id,
        content: "Updated",
        properties: {},
    });

    expect(created.id).toStartWith("b_");
    expect(updated).toEqual({
        id: created.id,
        content: "Updated",
        properties: {},
    });
    expect(readBlock(db, created.id)).toEqual(updated);
});

test("writeObject creates a complete recursive object and returns flat blocks", () => {
    db = initializeDatabase(":memory:");
    const databaseID = readDatabase(db).id;

    const object = writeObject(db, {
        parentID: databaseID,
        name: "Tree",
        properties: { status: "active" },
        blocks: [{
            content: "Parent",
            properties: {},
            children: [{
                content: "Child",
                properties: { level: 1 },
                children: [{
                    content: "Grandchild",
                    properties: {},
                    children: [],
                }],
            }],
        }, {
            content: "Second",
            properties: {},
            children: [],
        }],
    });

    expect(object.id).toStartWith("o_");
    expect(object.blocks).toHaveLength(4);
    expect(object.blocks.map((block) => block.content)).toEqual([
        "Parent",
        "Child",
        "Grandchild",
        "Second",
    ]);
    expect(object.blocks.map((block) => block.position)).toEqual([0, 0, 0, 1]);
    expect(object.blocks[1]?.parentBlockID).toBe(object.blocks[0]?.id);
    expect(object.blocks[2]?.parentBlockID).toBe(object.blocks[1]?.id);
    expect(readObject(db, object.id)).toEqual(object);
});

test("writeObject completely replaces placements and globally updates reused blocks", () => {
    db = initializeDatabase(":memory:");
    const databaseID = readDatabase(db).id;
    const shared = createBlock(db, "Shared");
    const first = writeObject(db, objectWrite(databaseID, "First", shared.id));
    const second = writeObject(db, objectWrite(databaseID, "Second", shared.id));
    const omitted = first.blocks[1]!;

    const replaced = writeObject(db, {
        id: first.id,
        parentID: databaseID,
        name: "First updated",
        properties: {},
        blocks: [{
            id: shared.id,
            content: "Shared globally updated",
            properties: {},
            children: [],
        }],
    });

    expect(replaced.blocks.map((block) => block.id)).toEqual([shared.id]);
    expect(readObject(db, second.id).blocks[0]?.content).toBe("Shared globally updated");
    expect(readBlock(db, omitted.id).content).toBe("First child");
});

test("entity-specific list functions return metadata and direct IDs", () => {
    db = initializeDatabase(":memory:");
    const databaseID = readDatabase(db).id;
    const silo = createSilo(db, databaseID, "Projects");
    const object = writeObject(db, {
        parentID: silo.id,
        name: "Object",
        properties: {},
        blocks: [{
            content: "Parent",
            properties: {},
            children: [{
                content: "Child",
                properties: {},
                children: [],
            }],
        }],
    });
    const parent = object.blocks[0]!;
    const child = object.blocks[1]!;

    expect(listDatabase(db)).toEqual({
        metadata: readDatabase(db),
        silos: [silo.id],
        objects: [],
    });
    expect(listSilo(db, silo.id)).toEqual({
        metadata: silo,
        silos: [],
        objects: [object.id],
    });
    expect(listObject(db, object.id)).toEqual({
        metadata: {
            id: object.id,
            parentID: silo.id,
            name: "Object",
            properties: {},
        },
        blocks: [parent.id],
    });
    expect(listBlock(db, child.id, object.id)).toEqual({
        metadata: {
            id: child.id,
            properties: {},
        },
        objectID: object.id,
        ancestors: [parent.id],
        children: [],
    });
});

test("recursive silo deletion preserves canonical blocks", () => {
    db = initializeDatabase(":memory:");
    const databaseID = readDatabase(db).id;
    const root = createSilo(db, databaseID, "Root");
    const child = createSilo(db, root.id, "Child");
    const object = writeObject(db, {
        parentID: child.id,
        name: "Nested",
        properties: {},
        blocks: [{
            content: "Preserved",
            properties: {},
            children: [],
        }],
    });
    const blockID = object.blocks[0]!.id;

    expect(deleteSilo(db, root.id)).toBe(true);
    expect(() => readSilo(db!, child.id)).toThrow();
    expect(() => readObject(db!, object.id)).toThrow();
    expect(readBlock(db, blockID).content).toBe("Preserved");
});

test("search supports an optional entity type parameter", () => {
    db = initializeDatabase(":memory:");
    const databaseID = readDatabase(db).id;
    const silo = createSilo(db, databaseID, "Projects", { tag: "needle" });
    const object = createObject(db, databaseID, "Needle object");
    const block = createBlock(db, "Needle block");

    expect(search(db, "needle").map((result) => result.id)).toEqual([
        block.id,
        object.id,
        silo.id,
    ]);
    expect(search(db, "needle", "block")).toEqual([{
        type: "block",
        id: block.id,
        label: "Needle block",
    }]);
});

test("writeObject rejects missing and duplicate existing blocks", () => {
    db = initializeDatabase(":memory:");
    const databaseID = readDatabase(db).id;
    const existing = createBlock(db, "Existing");

    expect(() => writeObject(db!, {
        parentID: databaseID,
        name: "Missing",
        properties: {},
        blocks: [{
            id: "b_missing",
            content: "Missing",
            properties: {},
            children: [],
        }],
    })).toThrow("Block not found");

    expect(() => writeObject(db!, {
        parentID: databaseID,
        name: "Duplicate",
        properties: {},
        blocks: [{
            id: existing.id,
            content: "First",
            properties: {},
            children: [],
        }, {
            id: existing.id,
            content: "Second",
            properties: {},
            children: [],
        }],
    })).toThrow("Duplicate block ID");
});

function objectWrite(parentID: string, name: string, sharedBlockID: string): ObjectWrite {
    return {
        parentID,
        name,
        properties: {},
        blocks: [{
            id: sharedBlockID,
            content: "Shared",
            properties: {},
            children: [{
                content: `${name} child`,
                properties: {},
                children: [],
            }],
        }],
    };
}

import { afterEach, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    createBlock,
    create,
    createObject,
    deleteBlock,
    deleteEntity,
    deleteObject,
    initializeWorkspace,
    listBlock,
    listEntity,
    listObject,
    listWorkspace,
    openWorkspace,
    readBlock,
    readEntity,
    readObject,
    readWorkspace,
    search,
    writeBlock,
    writeEntity,
    writeObject,
} from "../../API";
import type { ObjectWrite } from "../../API";
import { initializeStorage } from "../../src/storage";

let db: Database | undefined;
let tempDirectory: string | undefined;
let originalHome: string | undefined;

afterEach(() => {
    db?.close();
    db = undefined;
    if (tempDirectory) {
        rmSync(tempDirectory, { recursive: true, force: true });
        tempDirectory = undefined;
    }
    if (originalHome === undefined) {
        delete process.env.HOME;
    } else {
        process.env.HOME = originalHome;
    }
    originalHome = undefined;
});

test("initializes and opens an existing managed workspace by name", () => {
    tempDirectory = mkdtempSync(join(tmpdir(), "tabula-api-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDirectory;
    const workspaceName = "workspace";
    const missingWorkspaceName = "missing";
    const databasePath = join(tempDirectory, ".tabula", `${workspaceName}.sqlite`);
    const missingPath = join(tempDirectory, ".tabula", `${missingWorkspaceName}.sqlite`);

    expect(() => openWorkspace(missingWorkspaceName)).toThrow();
    expect(existsSync(missingPath)).toBe(false);

    db = initializeWorkspace(workspaceName);
    const metadata = readWorkspace(db);
    expect(metadata.name).toBe(workspaceName);
    expect(existsSync(databasePath)).toBe(true);
    db.close();

    db = openWorkspace(workspaceName);
    expect(readWorkspace(db)).toEqual(metadata);
});

test("quick create functions return recursive public entities", () => {
    db = initializeStorage(":memory:");
    const objectResult = createObject(db, "Tabula", { active: true });
    const blockResult = createBlock(
        db,
        "Child",
        { kind: "text" },
        { parentID: objectResult.entity.id },
    );
    const object = objectResult.entity;
    const block = blockResult.entity;

    expect(objectResult.parentID).toBe(readWorkspace(db).id);
    expect(blockResult.parentID).toBe(object.id);
    expect(object).toEqual({
        id: expect.stringMatching(/^o_/),
        type: "object",
        name: "Tabula",
        properties: { active: true },
        children: [],
    });
    expect(block).toEqual({
        id: expect.stringMatching(/^b_/),
        type: "block",
        content: "Child",
        properties: { kind: "text" },
        children: [],
    });
    expect(readObject(db, object.id).entity).toEqual({
        ...object,
        children: [block],
    });
    expect(readBlock(db, block.id).entity).toEqual(block);
    expect(listWorkspace(db)).toEqual([object.id]);
});

test("block roots require an explicit parent", () => {
    db = initializeStorage(":memory:");
    const object = createObject(db, "Parent").entity;

    expect(() => createBlock(db!, "Missing parent")).toThrow("Block parent is required");
    expect(() => create(db!, {
        type: "block",
        content: "Missing parent",
        properties: {},
    })).toThrow("Block parent is required");
    expect(() => writeBlock(db!, {
        type: "block",
        content: "Missing parent",
        properties: {},
        children: [],
    })).toThrow("Block parent is required");

    const block = writeBlock(db, {
        type: "block",
        content: "Parented root",
        properties: {},
        children: [],
    }, { parentID: object.id });

    expect(block.parentID).toBe(object.id);
    expect(listObject(db, object.id)).toEqual([block.entity.id]);
});

test("generic create can attach entities to a parent", () => {
    db = initializeStorage(":memory:");
    const object = create(db, {
        type: "object",
        name: "Parent",
        properties: {},
    }).entity;
    const child = create(db, {
        type: "block",
        content: "Child",
        properties: {},
    }, { parentID: object.id });

    expect(child.parentID).toBe(object.id);
    expect(listEntity(db, object.id)).toEqual([child.entity.id]);
});

test("writeObject creates a mixed recursive entity tree", () => {
    db = initializeStorage(":memory:");

    const object = writeObject(db, {
        type: "object",
        name: "Root",
        properties: { status: "active" },
        children: [{
            type: "block",
            content: "Parent block",
            properties: {},
            children: [{
                type: "object",
                name: "Nested object",
                properties: { level: 1 },
                children: [{
                    type: "block",
                    content: "Nested block",
                    properties: {},
                    children: [],
                }],
            }],
        }, {
            type: "block",
            content: "Second block",
            properties: {},
            children: [],
        }],
    }).entity;

    expect(object.id).toStartWith("o_");
    expect(object.children.map((child) => child.type)).toEqual(["block", "block"]);
    expect(object.children[0]?.children[0]?.type).toBe("object");
    expect(object.children[0]?.children[0]?.children[0]?.type).toBe("block");
    expect(readObject(db, object.id).entity).toEqual(object);
});

test("read output can be written back without changing shape", () => {
    db = initializeStorage(":memory:");
    const created = writeObject(db, objectWrite("Round trip")).entity;

    expect(writeObject(db, created).entity).toEqual(created);
    expect(readObject(db, created.id).entity).toEqual(created);
});

test("replacement writes delete omitted subtrees", () => {
    db = initializeStorage(":memory:");
    const created = writeObject(db, objectWrite("Original")).entity;
    const omittedBlock = created.children[0]!;
    const omittedObject = omittedBlock.children[0]!;

    const replaced = writeObject(db, {
        id: created.id,
        type: "object",
        name: "Updated",
        properties: {},
        children: [],
    }).entity;

    expect(replaced.children).toEqual([]);
    expect(() => readBlock(db!, omittedBlock.id)).toThrow("Entity not found");
    expect(() => readObject(db!, omittedObject.id)).toThrow("Entity not found");
});

test("explicit IDs move existing entities into the submitted tree", () => {
    db = initializeStorage(":memory:");
    const first = writeObject(db, objectWrite("First")).entity;
    const moved = first.children[0]!;
    const second = writeObject(db, {
        type: "object",
        name: "Second",
        properties: {},
        children: [{
            id: moved.id,
            type: "block",
            content: "Moved and updated",
            properties: {},
            children: [],
        }],
    }).entity;

    expect(listObject(db, first.id)).toEqual([]);
    expect(listObject(db, second.id)).toEqual([moved.id]);
    expect(readObject(db, first.id).entity.children).toEqual([]);
    expect(readObject(db, second.id).entity.children.map((child) => child.id)).toEqual([moved.id]);
    expect(readBlock(db, moved.id).entity.content).toBe("Moved and updated");
});

test("moving an object to the workspace root detaches its prior parent", () => {
    db = initializeStorage(":memory:");
    const parent = writeObject(db, objectWrite("Parent")).entity;
    const nested = parent.children[0]!.children[0]!;
    if (nested.type !== "object") {
        throw new Error("Expected nested child to be an object");
    }

    const moved = writeObject(db, {
        id: nested.id,
        type: "object",
        name: "Moved Root",
        properties: {},
        children: [],
    }).entity;

    expect(listWorkspace(db)).toEqual([parent.id, nested.id]);
    expect(readObject(db, parent.id).entity.children[0]?.children).toEqual([]);
    expect(readObject(db, nested.id).entity).toEqual(moved);
});

test("submitted children replace a moved entity's existing children", () => {
    db = initializeStorage(":memory:");
    const first = writeObject(db, objectWrite("First")).entity;
    const moved = first.children[0]!;
    const oldChild = moved.children[0]!;
    const second = writeObject(db, {
        type: "object",
        name: "Second",
        properties: {},
        children: [{
            id: moved.id,
            type: "block",
            content: "Moved without children",
            properties: {},
            children: [],
        }],
    }).entity;

    expect(readObject(db, first.id).entity.children).toEqual([]);
    expect(readObject(db, second.id).entity.children.map((child) => child.id)).toEqual([moved.id]);
    expect(readBlock(db, moved.id).entity.children).toEqual([]);
    expect(() => readObject(db!, oldChild.id)).toThrow("Entity not found");
});

test("entity-specific list functions return direct child IDs", () => {
    db = initializeStorage(":memory:");
    const objectResult = writeObject(db, objectWrite("Listed"));
    const object = objectResult.entity;
    const block = object.children[0]!;
    const nested = block.children[0]!;

    expect(listWorkspace(db)).toEqual([object.id]);
    expect(listObject(db, object.id)).toEqual([block.id]);
    expect(listBlock(db, block.id)).toEqual([nested.id]);
});

test("parented block root writes can own children", () => {
    db = initializeStorage(":memory:");
    const object = createObject(db, "Parent").entity;
    const blockResult = writeBlock(db, {
        type: "block",
        content: "Parented root",
        properties: {},
        children: [{
            type: "object",
            name: "Nested only",
            properties: {},
            children: [],
        }],
    }, { parentID: object.id });
    const block = blockResult.entity;

    expect(blockResult.parentID).toBe(object.id);
    expect(readBlock(db, block.id).entity).toEqual(block);
    expect(listWorkspace(db)).toEqual([object.id]);
});

test("deleting an entity deletes its subtree", () => {
    db = initializeStorage(":memory:");
    const object = writeObject(db, objectWrite("Delete")).entity;
    const blockID = object.children[0]!.id;
    const nestedObjectID = object.children[0]!.children[0]!.id;

    expect(deleteObject(db, object.id)).toBe(true);
    expect(() => readObject(db!, object.id)).toThrow();
    expect(() => readBlock(db!, blockID)).toThrow();
    expect(() => readObject(db!, nestedObjectID)).toThrow();

    const parent = createObject(db, "Parent").entity;
    const parented = writeBlock(db, {
        type: "block",
        content: "Parent",
        properties: {},
        children: [{
            type: "block",
            content: "Child",
            properties: {},
            children: [],
        }],
    }, { parentID: parent.id }).entity;
    const childID = parented.children[0]!.id;
    expect(deleteBlock(db, parented.id)).toBe(true);
    expect(() => readBlock(db!, childID)).toThrow();
});

test("search supports an optional entity type parameter", () => {
    db = initializeStorage(":memory:");
    const object = createObject(db, "Needle object").entity;
    const block = createBlock(db, "Needle block", {}, { parentID: object.id }).entity;

    expect(search(db, "needle").map((result) => result.id)).toEqual([
        block.id,
        object.id,
    ]);
    expect(search(db, "needle", "block")).toEqual([{
        type: "block",
        id: block.id,
        label: "Needle block",
    }]);
});

test("write validation rejects duplicate IDs and cycles", () => {
    db = initializeStorage(":memory:");
    const first = createObject(db, "First").entity;
    const second = createObject(db, "Second").entity;

    expect(() => writeObject(db!, {
        type: "object",
        name: "Duplicate",
        properties: {},
        children: [{
            id: "b_same",
            type: "block",
            content: "First",
            properties: {},
            children: [],
        }, {
            id: "b_same",
            type: "block",
            content: "Second",
            properties: {},
            children: [],
        }],
    })).toThrow("Duplicate entity ID");

    expect(() => writeObject(db!, {
        id: first.id,
        type: "object",
        name: "Cycle",
        properties: {},
        children: [{
            id: second.id,
            type: "object",
            name: "Second",
            properties: {},
            children: [{
                id: first.id,
                type: "object",
                name: "First",
                properties: {},
                children: [],
            }],
        }],
    })).toThrow("Duplicate entity ID");
});

function objectWrite(name: string): ObjectWrite {
    return {
        type: "object",
        name,
        properties: {},
        children: [{
            type: "block",
            content: `${name} block`,
            properties: {},
            children: [{
                type: "object",
                name: `${name} child object`,
                properties: {},
                children: [],
            }],
        }],
    };
}

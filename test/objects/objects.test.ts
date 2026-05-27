import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
    createObject,
    deleteObject,
    isObject,
    readObject,
    readObjectFrontmatter,
    writeObject,
} from "../../core/storage/fs/objects";

let rootPath: string | undefined;

afterAll(async () => {
    if (rootPath) {
        await deleteObject(join(rootPath, "test-object.md"));
        await deleteObject(join(rootPath, "missing-object.md"));
    }
});

test("object fs operations create, read, write, reject id changes, and delete objects", async () => {
    rootPath = await mkdtemp(join(tmpdir(), "silo-object-fs-"));
    const objectPath = join(rootPath, "test-object.md");
    const missingPath = join(rootPath, "missing-object.md");
    const nonObjectPath = join(rootPath, "non-object.md");
    const properties = {
        purpose: "object fs test",
        level: 0,
        active: true,
    };
    const body = "# Test Object\n\nThis is the object body.";

    const objectID = await createObject(objectPath, "Test_Object", body, properties);

    expect(objectID.startsWith("o_")).toBe(true);
    expect(await isObject(objectPath)).toBe(true);
    await writeFile(nonObjectPath, "---\nid: s_fake\nname: Not Object\n---\n", "utf8");
    expect(await isObject(nonObjectPath)).toBe(false);

    const frontmatter = await readObjectFrontmatter(objectPath);
    expect(frontmatter).toEqual({
        id: objectID,
        name: "Test_Object",
        properties,
    });
    expect("body" in frontmatter).toBe(false);

    const object = await readObject(objectPath);
    expect(object).toEqual({
        id: objectID,
        name: "Test_Object",
        properties,
        body,
    });

    await writeObject(objectPath, {
        id: objectID,
        name: "Test_Object_Updated",
        properties: {
            purpose: "updated object fs test",
            level: 1,
            updated: true,
        },
        body: "Updated object body.",
    });

    expect(await readObject(objectPath)).toEqual({
        id: objectID,
        name: "Test_Object_Updated",
        properties: {
            purpose: "updated object fs test",
            level: 1,
            updated: true,
        },
        body: "Updated object body.",
    });

    await expect(writeObject(objectPath, {
        id: "o_changed",
        name: "Invalid_ID_Update",
        properties: {
            purpose: "should fail",
        },
        body: "This write should fail.",
    })).rejects.toThrow("Cannot change object id");
    expect((await readObjectFrontmatter(objectPath)).id).toBe(objectID);

    expect(await deleteObject(missingPath)).toBe(false);
    expect(await deleteObject(objectPath)).toBe(true);
    expect(existsSync(objectPath)).toBe(false);
});

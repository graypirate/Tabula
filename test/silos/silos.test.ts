// Tests for the silo filesystem operations
// WARNING: Will attempt to test operations on the actual filesystem @ ~/Desktop

import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
    createSilo,
    deleteSilo,
    isSilo,
    readSilo,
    readSiloFrontmatter,
    writeSilo,
} from "../../core/storage/fs/silos";

const desktopPath = join(process.env.HOME ?? "", "Desktop");
const testSiloPath = join(desktopPath, "Test_Silo");
const nestedSiloPath = join(testSiloPath, "Nested_Silo");
const deeplyNestedSiloPath = join(nestedSiloPath, "Deeply_Nested_Silo");

afterAll(async () => {
    await deleteSilo(testSiloPath);
});

test("silo fs operations create, read by depth, write, and delete silos", async () => {
    await deleteSilo(testSiloPath);

    const rootProperties = {
        purpose: "silo fs test",
        level: 0,
        active: true,
    };

    const rootID = await createSilo(testSiloPath, "Test_Silo", rootProperties);
    const nestedID = await createSilo(nestedSiloPath, "Nested_Silo", {
        purpose: "nested silo fs test",
        level: 1,
    });
    const deeplyNestedID = await createSilo(deeplyNestedSiloPath, "Deeply_Nested_Silo", {
        purpose: "deeply nested silo fs test",
        level: 2,
    });

    expect(rootID.startsWith("s_")).toBe(true);
    expect(nestedID.startsWith("s_")).toBe(true);
    expect(deeplyNestedID.startsWith("s_")).toBe(true);
    expect(await isSilo(testSiloPath)).toBe(true);
    expect(await isSilo(nestedSiloPath)).toBe(true);
    expect(await isSilo(deeplyNestedSiloPath)).toBe(true);

    const depth0 = await readSilo(testSiloPath, 0);
    expect(depth0.frontmatter.id).toBe(rootID);
    expect(depth0.frontmatter.name).toBe("Test_Silo");
    expect(depth0.frontmatter.properties).toEqual(rootProperties);
    expect(depth0.objects).toEqual([]);
    expect(depth0.silos).toEqual([]);

    const depth1 = await readSilo(testSiloPath, 1);
    expect(depth1.silos).toHaveLength(1);
    expect(depth1.silos[0]?.frontmatter.id).toBe(nestedID);
    expect(depth1.silos[0]?.frontmatter.name).toBe("Nested_Silo");
    expect(depth1.silos[0]?.silos).toEqual([]);

    const depth2 = await readSilo(testSiloPath, 2);
    expect(depth2.silos).toHaveLength(1);
    expect(depth2.silos[0]?.silos).toHaveLength(1);
    expect(depth2.silos[0]?.silos[0]?.frontmatter.id).toBe(deeplyNestedID);
    expect(depth2.silos[0]?.silos[0]?.frontmatter.name).toBe("Deeply_Nested_Silo");

    const rootFrontmatter = await readSiloFrontmatter(testSiloPath);
    expect(rootFrontmatter).toEqual({
        id: rootID,
        name: "Test_Silo",
        properties: rootProperties,
    });

    await expect(writeSilo(testSiloPath, {
        id: "s_changed",
        name: "Invalid_ID_Update",
        properties: {
            purpose: "should fail",
        },
    })).rejects.toThrow("Cannot change silo id");
    expect((await readSiloFrontmatter(testSiloPath)).id).toBe(rootID);

    await writeSilo(testSiloPath, {
        id: rootID,
        name: "Test_Silo_Updated",
        properties: {
            purpose: "updated root silo",
            level: 0,
            updated: true,
        },
    });
    await writeSilo(nestedSiloPath, {
        id: nestedID,
        name: "Nested_Silo_Updated",
        properties: {
            purpose: "updated nested silo",
            level: 1,
            updated: true,
        },
    });
    await writeSilo(deeplyNestedSiloPath, {
        id: deeplyNestedID,
        name: "Deeply_Nested_Silo_Updated",
        properties: {
            purpose: "updated deeply nested silo",
            level: 2,
            updated: true,
        },
    });

    expect((await readSiloFrontmatter(testSiloPath)).name).toBe("Test_Silo_Updated");
    expect((await readSiloFrontmatter(nestedSiloPath)).name).toBe("Nested_Silo_Updated");
    expect((await readSiloFrontmatter(deeplyNestedSiloPath)).name).toBe("Deeply_Nested_Silo_Updated");

    expect(await deleteSilo(deeplyNestedSiloPath)).toBe(true);
    expect(existsSync(deeplyNestedSiloPath)).toBe(false);
    expect(await isSilo(nestedSiloPath)).toBe(true);

    expect(await deleteSilo(testSiloPath)).toBe(true);
    expect(existsSync(testSiloPath)).toBe(false);
});

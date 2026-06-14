import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type {
    Block,
    BlockList,
    DBMetadata,
    DatabaseList,
    Obj,
    ObjectList,
    SearchResult,
    SiloMetadata,
} from "../../API/index.ts";

const cliPath = resolve(import.meta.dir, "../../CLI/index.ts");
let tempDirectory: string | undefined;

afterEach(() => {
    if (tempDirectory !== undefined) {
        rmSync(tempDirectory, { recursive: true, force: true });
        tempDirectory = undefined;
    }
});

describe("CLI process output", () => {
    test("executes the complete recursive JSON workflow across processes", async () => {
        const databasePath = createDatabasePath();

        const initialized = await successfulJSON<DBMetadata>([
            "init",
            "--database",
            databasePath,
            "--name",
            "CLI Test",
        ]);
        expect(initialized.id).toStartWith("d_");
        expect(initialized).toMatchObject({
            name: "CLI Test",
            schemaVersion: 2,
        });

        const silo = await successfulJSON<SiloMetadata>([
            "create",
            "silo",
            "--database",
            databasePath,
            "--parent",
            initialized.id,
            "--name",
            "Projects",
            "--property",
            'status="active"',
            "--property",
            "priority=2",
        ]);
        expect(silo.id).toStartWith("s_");
        expect(silo).toMatchObject({
            parentID: initialized.id,
            properties: { status: "active", priority: 2 },
        });

        const emptyObject = await successfulJSON<Obj>([
            "create",
            "object",
            "--database",
            databasePath,
            "--parent",
            silo.id,
            "--name",
            "Empty",
        ]);
        expect(emptyObject.blocks).toEqual([]);

        const quickBlock = await successfulJSON<Block>([
            "create",
            "block",
            "--database",
            databasePath,
            "--content",
            "Quick block",
            "--property",
            "done=false",
        ]);
        expect(quickBlock.id).toStartWith("b_");
        expect(quickBlock.properties).toEqual({ done: false });

        const object = await successfulJSON<Obj>([
            "write",
            "--database",
            databasePath,
        ], JSON.stringify({
            parentID: silo.id,
            name: "AgentDB",
            properties: { stage: "MVP" },
            blocks: [{
                content: "Build the CLI",
                properties: { done: false },
                children: [{
                    content: "Validate recursive JSON",
                    children: [],
                }],
            }, {
                content: "Ship",
                children: [],
            }],
        }));
        expect(object.id).toStartWith("o_");
        expect(object.blocks).toHaveLength(2);
        expect(object.blocks[0]?.children).toHaveLength(1);
        const objectID = object.id;
        const parentBlockID = object.blocks[0]!.id;
        const childBlockID = object.blocks[0]!.children[0]!.id;

        expect(await successfulJSON<Obj>([
            "get",
            objectID,
            "--database",
            databasePath,
        ])).toEqual(object);

        const rewritten = await successfulJSON<Obj>([
            "write",
            "--database",
            databasePath,
        ], JSON.stringify(object));
        expect(rewritten).toEqual(object);

        expect(await successfulJSON<ObjectList>([
            "list",
            objectID,
            "--database",
            databasePath,
        ])).toEqual({
            metadata: {
                id: objectID,
                parentID: silo.id,
                name: "AgentDB",
                properties: { stage: "MVP" },
            },
            blocks: [parentBlockID, object.blocks[1]!.id],
        });

        expect(await successfulJSON<BlockList>([
            "list",
            childBlockID,
            "--database",
            databasePath,
            "--object",
            objectID,
        ])).toEqual({
            metadata: {
                id: childBlockID,
                properties: {},
            },
            objectID,
            ancestors: [parentBlockID],
            children: [],
        });

        const databaseList = await successfulJSON<DatabaseList>([
            "list",
            initialized.id,
            "--database",
            databasePath,
        ]);
        expect(databaseList.silos).toEqual([silo.id]);

        expect(await successfulJSON<boolean>([
            "delete",
            emptyObject.id,
            "--database",
            databasePath,
        ])).toBe(true);
    });

    test("creates and replaces a standalone block through write", async () => {
        const databasePath = createDatabasePath();
        await successfulJSON<DBMetadata>(["init", "--database", databasePath]);

        const created = await successfulJSON<Block>([
            "write",
            "--database",
            databasePath,
        ], JSON.stringify({
            content: "Searchable standalone content",
        }));
        expect(created.id).toStartWith("b_");

        const updated = await successfulJSON<Block>([
            "write",
            "--database",
            databasePath,
        ], JSON.stringify({
            id: created.id,
            content: "Searchable updated content",
            properties: { version: 2 },
        }));
        expect(updated).toEqual({
            id: created.id,
            content: "Searchable updated content",
            properties: { version: 2 },
        });

        expect(await successfulJSON<SearchResult[]>([
            "search",
            "updated",
            "--database",
            databasePath,
            "--type",
            "block",
        ])).toEqual([{
            type: "block",
            id: created.id,
            label: "Searchable updated content",
        }]);

        expect(await successfulJSON<boolean>([
            "delete",
            created.id,
            "--database",
            databasePath,
        ])).toBe(true);
    });

    test("supports concurrent reads and closes every process connection", async () => {
        const databasePath = createDatabasePath();
        const initialized = await successfulJSON<DBMetadata>([
            "init",
            "--database",
            databasePath,
        ]);

        const commands = [
            ["get", initialized.id, "--database", databasePath],
            ["list", initialized.id, "--database", databasePath],
            ["search", "missing", "--database", databasePath],
        ];
        const results = await Promise.all(commands.map((arguments_) => spawnCLI(arguments_)));

        expect(results.map((result) => result.exitCode)).toEqual([0, 0, 0]);
        expect(results.every((result) => result.stderr === "")).toBe(true);

        rmSync(tempDirectory!, { recursive: true });
        tempDirectory = undefined;
    });

    test("writes syntax and validation failures only to stderr with exit 2", async () => {
        const missingDatabase = await spawnCLI(["get", "o_example"]);
        expect(missingDatabase.exitCode).toBe(2);
        expect(missingDatabase.stdout).toBe("");
        expect(JSON.parse(missingDatabase.stderr)).toEqual({
            error: {
                code: "MISSING_OPTION",
                message: "Required option missing: --database",
            },
        });

        const malformed = await spawnCLI([
            "write",
            "--database",
            "agent.db",
        ], "{invalid");
        expect(malformed.exitCode).toBe(2);
        expect(malformed.stdout).toBe("");
        expect(JSON.parse(malformed.stderr)).toMatchObject({
            error: { code: "INVALID_JSON" },
        });

        const storageShape = await spawnCLI([
            "write",
            "--database",
            "agent.db",
        ], JSON.stringify({
            parentID: "d_parent",
            name: "Invalid",
            blocks: [{
                content: "Flat",
                parentBlockID: "b_parent",
                position: 0,
                children: [],
            }],
        }));
        expect(storageShape.exitCode).toBe(2);
        expect(storageShape.stdout).toBe("");
        expect(JSON.parse(storageShape.stderr)).toMatchObject({
            error: { code: "UNKNOWN_FIELD" },
        });

        const invalidProperty = await spawnCLI([
            "create",
            "block",
            "--database",
            "agent.db",
            "--content",
            "Invalid",
            "--property",
            "missing-separator",
        ]);
        expect(invalidProperty.exitCode).toBe(2);
        expect(invalidProperty.stdout).toBe("");
        expect(JSON.parse(invalidProperty.stderr)).toMatchObject({
            error: { code: "INVALID_PROPERTY" },
        });
    });

    test("maps database and API failures to exit 1", async () => {
        const missing = await spawnCLI([
            "get",
            "o_missing",
            "--database",
            join(tmpdir(), `agentdb-missing-${crypto.randomUUID()}.sqlite`),
        ]);
        expect(missing.exitCode).toBe(1);
        expect(missing.stdout).toBe("");
        expect(JSON.parse(missing.stderr)).toMatchObject({
            error: { code: "DATABASE_OPEN_FAILED" },
        });

        const databasePath = createDatabasePath();
        const initialized = await successfulJSON<DBMetadata>([
            "init",
            "--database",
            databasePath,
        ]);
        const mismatch = await spawnCLI([
            "get",
            "d_different",
            "--database",
            databasePath,
        ]);
        expect(mismatch.exitCode).toBe(1);
        expect(mismatch.stdout).toBe("");
        expect(JSON.parse(mismatch.stderr)).toMatchObject({
            error: { code: "DATABASE_ID_MISMATCH" },
        });

        const missingObject = await spawnCLI([
            "get",
            "o_missing",
            "--database",
            databasePath,
        ]);
        expect(missingObject.exitCode).toBe(1);
        expect(missingObject.stdout).toBe("");
        expect(JSON.parse(missingObject.stderr)).toMatchObject({
            error: {
                code: "OPERATION_FAILED",
                message: "Object not found: o_missing",
            },
        });
        expect(initialized.id).toStartWith("d_");
    });
});

function createDatabasePath(): string {
    tempDirectory = mkdtempSync(join(tmpdir(), "agentdb-cli-"));
    return join(tempDirectory, "agent.sqlite");
}

async function successfulJSON<T>(arguments_: string[], input?: string): Promise<T> {
    const result = await spawnCLI(arguments_, input);
    if (result.exitCode !== 0) {
        throw new Error(`CLI failed: ${result.stderr}`);
    }
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout.endsWith("\n")).toBe(true);
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    return JSON.parse(result.stdout) as T;
}

async function spawnCLI(
    arguments_: string[],
    input?: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const process = Bun.spawn([Bun.which("bun")!, cliPath, ...arguments_], {
        stdin: input === undefined ? "ignore" : "pipe",
        stdout: "pipe",
        stderr: "pipe",
    });

    if (input !== undefined) {
        process.stdin!.write(input);
        process.stdin!.end();
    }

    const [exitCode, stdout, stderr] = await Promise.all([
        process.exited,
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
    ]);

    return { exitCode, stdout, stderr };
}

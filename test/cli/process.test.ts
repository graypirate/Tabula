import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type {
    Block,
    Result,
    Obj,
    SearchResult,
    WorkspaceMetadata,
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
    test("lists managed workspace names", async () => {
        const firstWorkspace = createWorkspaceName("beta");

        expect(await successfulJSON<string[]>(["list"])).toEqual([]);

        await successfulJSON<WorkspaceMetadata>(["init", "--workspace", firstWorkspace]);
        await successfulJSON<WorkspaceMetadata>(["init", "--workspace", "alpha"]);

        expect(await successfulJSON<string[]>(["list"])).toEqual(["alpha", "beta"]);

        const betaPath = join(tempDirectory!, ".agentdb", `${firstWorkspace}.sqlite`);
        writeFileSync(`${betaPath}-wal`, "");
        writeFileSync(`${betaPath}-shm`, "");

        expect(await successfulJSON<boolean>(["delete", "--workspace", firstWorkspace])).toBe(true);
        expect(existsSync(betaPath)).toBe(false);
        expect(existsSync(`${betaPath}-wal`)).toBe(false);
        expect(existsSync(`${betaPath}-shm`)).toBe(false);
        expect(await successfulJSON<string[]>(["list"])).toEqual(["alpha"]);

        const missingDelete = await spawnCLI(["delete", "--workspace", firstWorkspace]);
        expect(missingDelete.exitCode).toBe(1);
        expect(missingDelete.stdout).toBe("");
        expect(JSON.parse(missingDelete.stderr)).toMatchObject({
            error: {
                code: "WORKSPACE_DELETE_FAILED",
                message: `Workspace not found: ${firstWorkspace}`,
            },
        });
    });

    test("executes the complete recursive entity workflow across processes", async () => {
        const workspaceName = createWorkspaceName();

        const initialized = await successfulJSON<WorkspaceMetadata>([
            "init",
            "--workspace",
            workspaceName,
        ]);
        expect(initialized.id).toStartWith("d_");
        expect(initialized).toMatchObject({
            name: workspaceName,
            schemaVersion: "0.0.3",
        });
        expect(existsSync(join(tempDirectory!, ".agentdb", `${workspaceName}.sqlite`))).toBe(true);
        expect(await successfulJSON<WorkspaceMetadata>([
            "read",
            "--workspace",
            workspaceName,
        ])).toEqual(initialized);

        const emptyObjectResult = await successfulJSON<Result<Obj>>([
            "create",
            "object",
            "--workspace",
            workspaceName,
            "--name",
            "Empty",
            "--property",
            'status="active"',
            "--property",
            "priority=2",
        ]);
        const emptyObject = emptyObjectResult.entity;
        expect(emptyObjectResult.parentID).toBe(initialized.id);
        expect(emptyObject.children).toEqual([]);
        expect(emptyObject).toMatchObject({
            type: "object",
            properties: { status: "active", priority: 2 },
        });

        const quickBlockResult = await successfulJSON<Result<Block>>([
            "create",
            "block",
            "--workspace",
            workspaceName,
            "--content",
            "Quick block",
            "--parent",
            emptyObject.id,
            "--property",
            "done=false",
        ]);
        const quickBlock = quickBlockResult.entity;
        expect(quickBlockResult.parentID).toBe(emptyObject.id);
        expect(quickBlock.id).toStartWith("b_");
        expect(quickBlock.children).toEqual([]);
        expect(quickBlock.properties).toEqual({ done: false });

        const childBlockResult = await successfulJSON<Result<Block>>([
            "create",
            "block",
            "--workspace",
            workspaceName,
            "--content",
            "Child quick block",
            "--parent",
            emptyObject.id,
        ]);
        expect(childBlockResult.parentID).toBe(emptyObject.id);
        expect(childBlockResult.entity.children).toEqual([]);

        const objectResult = await successfulJSON<Result<Obj>>([
            "write",
            "--workspace",
            workspaceName,
        ], JSON.stringify({
            type: "object",
            name: "AgentDB",
            properties: { stage: "MVP" },
            children: [{
                type: "block",
                content: "Build the CLI",
                properties: { done: false },
                children: [{
                    type: "object",
                    name: "Validate recursive JSON",
                    children: [],
                }],
            }, {
                type: "block",
                content: "Ship",
                children: [],
            }],
        }));
        const object = objectResult.entity;
        expect(objectResult.parentID).toBe(initialized.id);
        expect(object.id).toStartWith("o_");
        expect(object.children).toHaveLength(2);
        expect(object.children[0]?.children).toHaveLength(1);
        const objectID = object.id;
        const parentBlockID = object.children[0]!.id;
        const childObjectID = object.children[0]!.children[0]!.id;

        expect(await successfulJSON<Result<Obj>>([
            "read",
            objectID,
            "--workspace",
            workspaceName,
        ])).toEqual(objectResult);

        const rewritten = await successfulJSON<Result<Obj>>([
            "write",
            "--workspace",
            workspaceName,
        ], JSON.stringify(object));
        expect(rewritten).toEqual(objectResult);

        expect(await successfulJSON<string[]>([
            "list",
            objectID,
            "--workspace",
            workspaceName,
        ])).toEqual([parentBlockID, object.children[1]!.id]);

        expect(await successfulJSON<string[]>([
            "list",
            parentBlockID,
            "--workspace",
            workspaceName,
        ])).toEqual([childObjectID]);

        const workspaceList = await successfulJSON<string[]>([
            "list",
            "--workspace",
            workspaceName,
        ]);
        expect(workspaceList).toEqual([emptyObject.id, objectID]);

        expect(await successfulJSON<boolean>([
            "delete",
            emptyObject.id,
            "--workspace",
            workspaceName,
        ])).toBe(true);
    });

    test("creates and replaces a parented block through write", async () => {
        const workspaceName = createWorkspaceName();
        await successfulJSON<WorkspaceMetadata>(["init", "--workspace", workspaceName]);
        const parent = await successfulJSON<Result<Obj>>([
            "create",
            "object",
            "--workspace",
            workspaceName,
            "--name",
            "Parent",
        ]);

        const createdResult = await successfulJSON<Result<Block>>([
            "write",
            "--workspace",
            workspaceName,
            "--parent",
            parent.entity.id,
        ], JSON.stringify({
            type: "block",
            content: "Searchable parented content",
            children: [],
        }));
        const created = createdResult.entity;
        expect(createdResult.parentID).toBe(parent.entity.id);
        expect(created.id).toStartWith("b_");

        const updated = await successfulJSON<Result<Block>>([
            "write",
            "--workspace",
            workspaceName,
            "--parent",
            parent.entity.id,
        ], JSON.stringify({
            id: created.id,
            type: "block",
            content: "Searchable updated content",
            properties: { version: 2 },
            children: [],
        }));
        expect(updated).toEqual({
            parentID: parent.entity.id,
            entity: {
                id: created.id,
                type: "block",
                content: "Searchable updated content",
                properties: { version: 2 },
                children: [],
            },
        });

        expect(await successfulJSON<SearchResult[]>([
            "search",
            "updated",
            "--workspace",
            workspaceName,
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
            "--workspace",
            workspaceName,
        ])).toBe(true);

        const missingParent = await spawnCLI([
            "write",
            "--workspace",
            workspaceName,
        ], JSON.stringify({
            type: "block",
            content: "Missing parent",
            children: [],
        }));
        expect(missingParent.exitCode).toBe(2);
        expect(missingParent.stdout).toBe("");
        expect(JSON.parse(missingParent.stderr)).toMatchObject({
            error: { code: "MISSING_OPTION" },
        });
    });

    test("supports concurrent reads and closes every process connection", async () => {
        const workspaceName = createWorkspaceName();
        await successfulJSON<WorkspaceMetadata>([
            "init",
            "--workspace",
            workspaceName,
        ]);

        const commands = [
            ["read", "--workspace", workspaceName],
            ["list", "--workspace", workspaceName],
            ["search", "missing", "--workspace", workspaceName],
        ];
        const results = await Promise.all(commands.map((arguments_) => spawnCLI(arguments_)));

        expect(results.map((result) => result.exitCode)).toEqual([0, 0, 0]);
        expect(results.every((result) => result.stderr === "")).toBe(true);

        rmSync(tempDirectory!, { recursive: true });
        tempDirectory = undefined;
    });

    test("writes syntax and validation failures only to stderr with exit 2", async () => {
        const missingWorkspace = await spawnCLI(["read", "o_example"]);
        expect(missingWorkspace.exitCode).toBe(2);
        expect(missingWorkspace.stdout).toBe("");
        expect(JSON.parse(missingWorkspace.stderr)).toEqual({
            error: {
                code: "MISSING_OPTION",
                message: "Required option missing: --workspace",
            },
        });

        const malformed = await spawnCLI([
            "write",
            "--workspace",
            "agent",
        ], "{invalid");
        expect(malformed.exitCode).toBe(2);
        expect(malformed.stdout).toBe("");
        expect(JSON.parse(malformed.stderr)).toMatchObject({
            error: { code: "INVALID_JSON" },
        });

        const oldShape = await spawnCLI([
            "write",
            "--workspace",
            "agent",
        ], JSON.stringify({
            parentID: "d_parent",
            name: "Invalid",
            blocks: [],
        }));
        expect(oldShape.exitCode).toBe(2);
        expect(oldShape.stdout).toBe("");
        expect(JSON.parse(oldShape.stderr)).toMatchObject({
            error: { code: "INVALID_FIELD" },
        });

        const invalidProperty = await spawnCLI([
            "create",
            "block",
            "--workspace",
            "agent",
            "--content",
            "Invalid",
            "--parent",
            "o_parent",
            "--property",
            "missing-separator",
        ]);
        expect(invalidProperty.exitCode).toBe(2);
        expect(invalidProperty.stdout).toBe("");
        expect(JSON.parse(invalidProperty.stderr)).toMatchObject({
            error: { code: "INVALID_PROPERTY" },
        });

        const blockWithoutParent = await spawnCLI([
            "create",
            "block",
            "--workspace",
            "agent",
            "--content",
            "Invalid",
        ]);
        expect(blockWithoutParent.exitCode).toBe(2);
        expect(blockWithoutParent.stdout).toBe("");
        expect(JSON.parse(blockWithoutParent.stderr)).toMatchObject({
            error: { code: "MISSING_OPTION" },
        });
    });

    test("maps workspace and API failures to exit 1", async () => {
        const workspaceName = createWorkspaceName();
        const missing = await spawnCLI([
            "read",
            "o_missing",
            "--workspace",
            workspaceName,
        ]);
        expect(missing.exitCode).toBe(1);
        expect(missing.stdout).toBe("");
        expect(JSON.parse(missing.stderr)).toMatchObject({
            error: { code: "WORKSPACE_OPEN_FAILED" },
        });
        expect(existsSync(join(tempDirectory!, ".agentdb", `${workspaceName}.sqlite`))).toBe(false);

        const existingWorkspaceName = "existing";
        const initialized = await successfulJSON<WorkspaceMetadata>([
            "init",
            "--workspace",
            existingWorkspaceName,
        ]);
        const mismatch = await spawnCLI([
            "read",
            "d_different",
            "--workspace",
            existingWorkspaceName,
        ]);
        expect(mismatch.exitCode).toBe(1);
        expect(mismatch.stdout).toBe("");
        expect(JSON.parse(mismatch.stderr)).toMatchObject({
            error: { code: "WORKSPACE_ID_MISMATCH" },
        });

        const missingObject = await spawnCLI([
            "read",
            "o_missing",
            "--workspace",
            existingWorkspaceName,
        ]);
        expect(missingObject.exitCode).toBe(1);
        expect(missingObject.stdout).toBe("");
        expect(JSON.parse(missingObject.stderr)).toMatchObject({
            error: {
                code: "OPERATION_FAILED",
                message: "Entity not found: o_missing",
            },
        });
        expect(initialized.id).toStartWith("d_");
    });
});

function createWorkspaceName(name = "agent"): string {
    tempDirectory = mkdtempSync(join(tmpdir(), "agentdb-cli-"));
    return name;
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
        env: {
            ...Bun.env,
            ...(tempDirectory === undefined ? {} : { HOME: tempDirectory }),
        },
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

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCLI } from "../../CLI/index.ts";
import type { Result, Obj, WorkspaceMetadata } from "../../API/index.ts";

let tempDirectory: string | undefined;
let originalHome: string | undefined;

afterEach(() => {
    if (tempDirectory !== undefined) {
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

describe("CLI confirmation orchestration", () => {
    test("interactive workspace delete confirms before dispatching", async () => {
        useTempHome();
        const initialized = await successfulOutput<WorkspaceMetadata>([
            "init",
            "--workspace",
            "agent",
        ]);
        expect(initialized.name).toBe("agent");

        const databasePath = join(tempDirectory!, ".tabula", "agent.sqlite");
        expect(existsSync(databasePath)).toBe(true);

        const deleted = await runCLI([
            "delete",
            "--workspace",
            "agent",
        ], undefined, true, async (prompt) => {
            expect(prompt).toBe("Delete agent?");
            return true;
        });

        expect(deleted).toEqual({
            exitCode: 0,
            output: true,
            stream: "stdout",
        });
        expect(existsSync(databasePath)).toBe(false);
    });

    test("interactive entity delete confirms before dispatching", async () => {
        useTempHome();
        await successfulOutput<WorkspaceMetadata>(["init", "--workspace", "agent"]);
        const created = await successfulOutput<Result<Obj>>([
            "create",
            "object",
            "--workspace",
            "agent",
            "--name",
            "Target",
        ]);

        const deleted = await runCLI([
            "delete",
            created.entity.id,
            "--workspace",
            "agent",
        ], undefined, true, async (prompt) => {
            expect(prompt).toBe(`Delete ${created.entity.id}?`);
            return true;
        });

        expect(deleted).toEqual({
            exitCode: 0,
            output: true,
            stream: "stdout",
        });
        expect(await successfulOutput<string[]>(["list", "--workspace", "agent"])).toEqual([]);
    });

    test("rejected confirmation returns false and skips dispatch", async () => {
        useTempHome();
        await successfulOutput<WorkspaceMetadata>(["init", "--workspace", "agent"]);
        const databasePath = join(tempDirectory!, ".tabula", "agent.sqlite");

        const result = await runCLI([
            "delete",
            "--workspace",
            "agent",
        ], undefined, true, async () => false);

        expect(result).toEqual({
            exitCode: 0,
            output: false,
            stream: "stdout",
        });
        expect(existsSync(databasePath)).toBe(true);
    });
});

async function successfulOutput<T>(arguments_: string[]): Promise<T> {
    const result = await runCLI(arguments_, undefined, false);
    if (result.exitCode !== 0) {
        throw new Error(`CLI failed: ${JSON.stringify(result.output)}`);
    }
    expect(result.stream).toBe("stdout");
    return result.output as T;
}

function useTempHome(): void {
    tempDirectory = mkdtempSync(join(tmpdir(), "tabula-cli-index-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDirectory;
}

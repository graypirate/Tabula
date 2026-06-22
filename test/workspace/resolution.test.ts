import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    initializePackageStorage,
    InvalidWorkspaceNameError,
    getWorkspaceNames,
    resolveInitializedWorkspaceDatabasePath,
    resolveWorkspaceDatabasePath,
    validateWorkspaceName,
    workspaceDirectory,
} from "../../core/workspace";

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

test("resolves managed workspace names to SQLite database paths", () => {
    useTempHome();

    expect(workspaceDirectory()).toBe(join(tempDirectory!, ".agentdb"));
    expect(resolveWorkspaceDatabasePath("agent")).toBe(join(tempDirectory!, ".agentdb", "agent.sqlite"));
    expect(resolveWorkspaceDatabasePath("agent.db-1")).toBe(join(tempDirectory!, ".agentdb", "agent.db-1.sqlite"));
    expect(existsSync(join(tempDirectory!, ".agentdb"))).toBe(false);
});

test("rejects invalid workspace names", () => {
    for (const name of ["", "./notes.sqlite", "/tmp/notes.sqlite", "../notes", ".hidden", "bad:name"]) {
        expect(() => validateWorkspaceName(name)).toThrow(InvalidWorkspaceNameError);
        expect(() => resolveWorkspaceDatabasePath(name)).toThrow(InvalidWorkspaceNameError);
    }
});

test("initializes package storage idempotently", () => {
    useTempHome();
    const directory = join(tempDirectory!, ".agentdb");

    expect(initializePackageStorage()).toBe(directory);
    expect(existsSync(directory)).toBe(true);
    expect(initializePackageStorage()).toBe(directory);
    expect(resolveInitializedWorkspaceDatabasePath("agent")).toBe(join(directory, "agent.sqlite"));
    expect(existsSync(join(directory, "agent.sqlite"))).toBe(false);
});

test("lists valid managed workspace names", () => {
    useTempHome();

    expect(getWorkspaceNames()).toEqual([]);

    const directory = initializePackageStorage();
    writeFileSync(join(directory, "beta.sqlite"), "");
    writeFileSync(join(directory, "alpha.sqlite"), "");
    writeFileSync(join(directory, "alpha.sqlite-wal"), "");
    writeFileSync(join(directory, ".hidden.sqlite"), "");
    mkdirSync(join(directory, "nested.sqlite"));

    expect(getWorkspaceNames()).toEqual(["alpha", "beta"]);
});

function useTempHome(): void {
    tempDirectory = mkdtempSync(join(tmpdir(), "agentdb-resolution-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDirectory;
}

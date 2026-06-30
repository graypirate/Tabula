import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    deleteWorkspaceFiles,
    initializePackageStorage,
    InvalidWorkspaceNameError,
    listWorkspaceNames,
    resolveInitializedWorkspaceDatabasePath,
    resolveWorkspaceDatabasePath,
    validateWorkspaceName,
    workspaceDirectory,
} from "../../src/workspace";

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

    expect(workspaceDirectory()).toBe(join(tempDirectory!, ".tabula"));
    expect(resolveWorkspaceDatabasePath("agent")).toBe(join(tempDirectory!, ".tabula", "agent.sqlite"));
    expect(resolveWorkspaceDatabasePath("agent.db-1")).toBe(join(tempDirectory!, ".tabula", "agent.db-1.sqlite"));
    expect(existsSync(join(tempDirectory!, ".tabula"))).toBe(false);
});

test("rejects invalid workspace names", () => {
    for (const name of ["", "./notes.sqlite", "/tmp/notes.sqlite", "../notes", ".hidden", "bad:name"]) {
        expect(() => validateWorkspaceName(name)).toThrow(InvalidWorkspaceNameError);
        expect(() => resolveWorkspaceDatabasePath(name)).toThrow(InvalidWorkspaceNameError);
    }
});

test("initializes package storage idempotently", () => {
    useTempHome();
    const directory = join(tempDirectory!, ".tabula");

    expect(initializePackageStorage()).toBe(directory);
    expect(existsSync(directory)).toBe(true);
    expect(initializePackageStorage()).toBe(directory);
    expect(resolveInitializedWorkspaceDatabasePath("agent")).toBe(join(directory, "agent.sqlite"));
    expect(existsSync(join(directory, "agent.sqlite"))).toBe(false);
});

test("lists valid managed workspace names", () => {
    useTempHome();

    expect(listWorkspaceNames()).toEqual([]);

    const directory = initializePackageStorage();
    writeFileSync(join(directory, "beta.sqlite"), "");
    writeFileSync(join(directory, "alpha.sqlite"), "");
    writeFileSync(join(directory, "alpha.sqlite-wal"), "");
    writeFileSync(join(directory, ".hidden.sqlite"), "");
    mkdirSync(join(directory, "nested.sqlite"));

    expect(listWorkspaceNames()).toEqual(["alpha", "beta"]);
});

test("deletes managed workspace files without globbing neighboring paths", () => {
    useTempHome();

    const directory = initializePackageStorage();
    const workspacePath = join(directory, "agent.sqlite");
    const walPath = `${workspacePath}-wal`;
    const shmPath = `${workspacePath}-shm`;
    const journalPath = `${workspacePath}-journal`;
    const backupPath = `${workspacePath}.backup`;

    for (const path of [workspacePath, walPath, shmPath, journalPath, backupPath]) {
        writeFileSync(path, "");
    }

    expect(deleteWorkspaceFiles("agent")).toBe(true);
    expect(existsSync(workspacePath)).toBe(false);
    expect(existsSync(walPath)).toBe(false);
    expect(existsSync(shmPath)).toBe(false);
    expect(existsSync(journalPath)).toBe(false);
    expect(existsSync(backupPath)).toBe(true);
    expect(() => deleteWorkspaceFiles("agent")).toThrow("Workspace not found: agent");
});

function useTempHome(): void {
    tempDirectory = mkdtempSync(join(tmpdir(), "tabula-resolution-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempDirectory;
}

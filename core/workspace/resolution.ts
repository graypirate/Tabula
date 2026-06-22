import { type Dirent, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const WorkspaceDirectoryName = ".agentdb";
const DatabaseExtension = ".sqlite";
const WorkspaceNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export class InvalidWorkspaceNameError extends Error {
    override readonly name = "InvalidWorkspaceNameError";
    readonly details = {
        allowed: "letters, numbers, underscores, hyphens, and dots; must not start with a dot",
    };

    constructor(readonly workspaceName: string) {
        super(`Invalid workspace name: ${workspaceName}`);
    }
}

export function initializePackageStorage(): string {
    const directory = workspaceDirectory();
    mkdirSync(directory, { recursive: true });
    return directory;
}

export function validateWorkspaceName(name: string): void {
    if (!WorkspaceNamePattern.test(name)) {
        throw new InvalidWorkspaceNameError(name);
    }
}

export function resolveWorkspaceDatabasePath(name: string): string {
    validateWorkspaceName(name);
    return join(workspaceDirectory(), `${name}${DatabaseExtension}`);
}

export function resolveInitializedWorkspaceDatabasePath(name: string): string {
    validateWorkspaceName(name);
    initializePackageStorage();
    return resolveWorkspaceDatabasePath(name);
}

export function getWorkspaceNames(): string[] {
    let entries: Dirent[];
    try {
        entries = readdirSync(workspaceDirectory(), { withFileTypes: true });
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            return [];
        }
        throw error;
    }

    return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(DatabaseExtension))
        .map((entry) => entry.name.slice(0, -DatabaseExtension.length))
        .filter(isValidWorkspaceName)
        .sort();
}

export function workspaceDirectory(): string {
    return join(process.env.HOME ?? homedir(), WorkspaceDirectoryName);
}

function isValidWorkspaceName(name: string): boolean {
    return WorkspaceNamePattern.test(name);
}

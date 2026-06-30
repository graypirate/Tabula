#!/usr/bin/env bun

import { chmod, lstat, mkdir, readlink, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const binDirectory = process.env.BUN_INSTALL
    ? join(process.env.BUN_INSTALL, "bin")
    : join(homedir(), ".bun", "bin");
const executables = [
    { name: "tabula", source: join(root, "core", "CLI", "index.ts") },
    { name: "tabula-mcp", source: join(root, "mcp", "src", "index.ts") },
];

const action = Bun.argv[2];

if (action === "install") {
    const install = Bun.spawnSync(["bun", "install", "--frozen-lockfile"], {
        cwd: root,
        stdout: "inherit",
        stderr: "inherit",
    });
    if (install.exitCode !== 0) process.exit(install.exitCode);

    await mkdir(binDirectory, { recursive: true });
    for (const executable of executables) {
        const destination = join(binDirectory, executable.name);
        await replaceLink(destination);
        await chmod(executable.source, 0o755);
        await symlink(executable.source, destination);
        console.log(`Linked ${destination} -> ${executable.source}`);
    }
} else if (action === "uninstall") {
    for (const executable of executables) {
        const destination = join(binDirectory, executable.name);
        if (await removeOwnedLink(destination, executable.source)) {
            console.log(`Removed ${destination}`);
        }
    }
} else {
    console.error("Usage: bun scripts/local-install.ts <install|uninstall>");
    process.exit(2);
}

async function replaceLink(destination: string): Promise<void> {
    try {
        const metadata = await lstat(destination);
        if (!metadata.isSymbolicLink()) {
            throw new Error(`Refusing to overwrite non-symlink: ${destination}`);
        }
        await rm(destination);
    } catch (error) {
        if (isMissing(error)) return;
        throw error;
    }
}

async function removeOwnedLink(destination: string, source: string): Promise<boolean> {
    try {
        const metadata = await lstat(destination);
        if (!metadata.isSymbolicLink()) {
            throw new Error(`Refusing to remove non-symlink: ${destination}`);
        }
        const target = resolve(dirname(destination), await readlink(destination));
        if (target !== source) {
            throw new Error(`Refusing to remove link owned by another install: ${destination}`);
        }
        await rm(destination);
        return true;
    } catch (error) {
        if (isMissing(error)) return false;
        throw error;
    }
}

function isMissing(error: unknown): boolean {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

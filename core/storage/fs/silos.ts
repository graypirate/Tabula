// Contains filesystem operations for manipulating directories for use as Silos

import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { SiloFrontmatter, Silo, SiloID } from "../../types/silo"
import { createSiloID } from "../../utils/id";
import { parseFrontmatter, renderFrontmatter } from "../../utils/yaml";

const SILO_FILE = ".silo";

function siloFilePath(path: string): string {
    return join(path, SILO_FILE);
}

// MARK: -- Silo Operations

/**
 * Creates a new silo with the given name and optional properties.
 * @param path - The path where the silo directory should be created
 * @param name - The name of the silo to create
 * @param properties - Optional properties to associate with the silo
 * @returns The ID of the newly created silo
*/
export async function createSilo(path: string, name: string, properties?: Record<string, unknown>): Promise<SiloID> {
    const id = createSiloID();
    await mkdir(path, { recursive: true });
    await writeSilo(path, { id, name, properties: properties });
    return id;
}

/**
 * Reads the silo at the specified path and returns its full shape.
 * @param path The path to the silo to read
 * @param depth The number of nested silo levels to read
 * @returns The full Silo at specified path
 */
export async function readSilo(path: string, depth = 0): Promise<Silo> {
    const frontmatter = await readSiloFrontmatter(path);
    const silo: Silo = { frontmatter, objects: [], silos: [] };

    if (depth <= 0) return silo;

    const entries = await readdir(path, { withFileTypes: true });
    const childSilos = await Promise.all(
        entries
            .filter((entry) => entry.isDirectory())
            .map(async (entry) => {
                const childPath = join(path, entry.name);

                if (!(await isSilo(childPath))) {
                    return undefined;
                }

                return await readSilo(childPath, depth - 1);
            }),
    );

    silo.silos = childSilos.filter((child): child is Silo => Boolean(child));
    return silo;
}

/**
 * Reads the Silo frontmatter (name+properties) at the specified path.
 * This function does not read the silo's shape.
 * 
 * @param path The path to the silo to read
 * @returns The SiloFrontmatter at the path
 */
export async function readSiloFrontmatter(path: string): Promise<SiloFrontmatter> {
    const content = await readFile(siloFilePath(path), "utf8");
    return parseFrontmatter<SiloFrontmatter>(content);
}

/**
 * Writes the given frontmatter to the silo at the specified path.
 * @param path The path to the silo to write
 * @param frontmatter The frontmatter to write to the silo
 */
export async function writeSilo(path: string, frontmatter: SiloFrontmatter): Promise<void> {
    if (await isSilo(path)) {
        const current = await readSiloFrontmatter(path);

        if (current.id !== frontmatter.id) {
            throw new Error(`Cannot change silo id from ${current.id} to ${frontmatter.id}`);
        }
    }

    await mkdir(path, { recursive: true });
    await writeFile(siloFilePath(path), renderFrontmatter(frontmatter), "utf8");
}

/**
 * Deletes the silo at the specified path.
 * WARNING: This operation deletes all nested Silo Objects and Silos
 * @param path The silo path to delete
 * @returns True if the silo was successfully deleted
 */
export async function deleteSilo(path: string): Promise<boolean> {
    if (!(await isSilo(path))) {
        return false;
    }

    await rm(path, { recursive: true, force: true });
    return true;
}

// MARK: -- Silo Helpers

/**
 * Checks if the specified path is a silo.
 * @param path The path to check
 * @returns True if the path is a silo
 */
export async function isSilo(path: string): Promise<boolean> {
    try {
        const info = await stat(siloFilePath(path));
        return info.isFile();
    } catch {
        return false;
    }
}

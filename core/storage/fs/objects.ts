// Contains filesystem operations for manipulating Markdown files for use as Objects

import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { ObjFrontmatter, Obj, ObjID } from "../../types/object"
import { createObjectID, ObjectPrefix } from "../../utils/id";
import { parseFrontmatter, renderFrontmatter } from "../../utils/yaml";

// MARK: -- Internal helpers

function readMarkdownObjectBody(markdown: string): string {
    if (!markdown.startsWith("---")) {
        throw new Error("Object markdown must start with frontmatter");
    }

    const end = markdown.indexOf("\n---", 3);

    if (end === -1) {
        throw new Error("Object markdown frontmatter must end with ---");
    }

    return markdown.slice(end + "\n---".length).replace(/^\s*\r?\n/, "");
}

function renderObjectToString(object: Obj): string {
    return `${renderFrontmatter(object)}\n${object.body}`;
}

// MARK: -- Object Operations

/**
 * Creates a new object with the given name, body, and optional properties.
 * @param path - The path where the object markdown file should be created
 * @param name - The name of the object to create
 * @param body - The markdown body of the object
 * @param properties - Optional properties to associate with the object
 * @returns The ID of the newly created object
 */
export async function createObject(path: string, name: string, body: string, properties?: Record<string, unknown>): Promise<ObjID> {
    const id = createObjectID();
    await writeObject(path, { id, name, properties, body });
    return id;
}

/**
 * Reads the Object frontmatter (name+properties) at the specified path.
 * This function does not read the object's body.
 *
 * @param path The path to the object to read
 * @returns The ObjFrontmatter at the path
 */
export async function readObjectFrontmatter(path: string): Promise<ObjFrontmatter> {
    const content = await readFile(path, "utf8");
    return parseFrontmatter<ObjFrontmatter>(content);
}

/**
 * Reads the object at the specified path and returns its full shape.
 * @param path The path to the object to read
 * @returns The full Obj at specified path
 */
export async function readObject(path: string): Promise<Obj> {
    const content = await readFile(path, "utf8");
    const frontmatter = parseFrontmatter<ObjFrontmatter>(content);
    const body = readMarkdownObjectBody(content);
    return { ...frontmatter, body };
}

/**
 * Writes the given object to the specified path.
 * @param path The path to the object to write
 * @param object The object to write
 */
export async function writeObject(path: string, object: Obj): Promise<void> {
    if (await isObject(path)) {
        const current = await readObjectFrontmatter(path);

        if (current.id !== object.id) {
            throw new Error(`Cannot change object id from ${current.id} to ${object.id}`);
        }
    }

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, renderObjectToString(object), "utf8");
}

/**
 * Deletes the object at the specified path.
 * @param path The object path to delete
 * @returns True if the object was successfully deleted
 */
export async function deleteObject(path: string): Promise<boolean> {
    if (!(await isObject(path))) {
        return false;
    }

    await rm(path, { force: true });
    return true;
}

// MARK: -- Object Helpers

/**
 * Checks if the specified path is an object.
 * @param path The path to check
 * @returns True if the path is an object
 */
export async function isObject(path: string): Promise<boolean> {
    try {
        const info = await stat(path);
        if (!info.isFile()) {
            return false;
        }

        const frontmatter = await readObjectFrontmatter(path);
        return frontmatter.id.startsWith(ObjectPrefix);
    } catch {
        return false;
    }
}

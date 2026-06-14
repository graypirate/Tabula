import type { Database } from "bun:sqlite";

import {
    initDatabase,
    openDatabase as openStoredDatabase,
} from "../core/db/init";

export function initializeDatabase(path: string, name?: string): Database {
    return initDatabase(path, name);
}

export function openDatabase(path: string): Database {
    return openStoredDatabase(path);
}

import type { Database } from "bun:sqlite";

import {
    initializeDatabaseStorage,
    openDatabaseStorage,
} from "../core/storage";

export function initializeDatabase(path: string, name?: string): Database {
    return initializeDatabaseStorage(path, name);
}

export function openDatabase(path: string): Database {
    return openDatabaseStorage(path);
}

import type { Database } from "bun:sqlite";

import {
    initializeStorage,
    openStorage,
} from "../core/storage";

export function initializeDatabase(path: string, name?: string): Database {
    return initializeStorage(path, name);
}

export function openDatabase(path: string): Database {
    return openStorage(path);
}

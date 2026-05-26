import { randomUUID } from "node:crypto";

// HELPER: Creates a unique ID with the given prefix
function createID(prefix: string): string {
    const random = randomUUID().replaceAll("-", "").slice(0, 4);
    return `${prefix}_${random}`;
}

export function createSiloID(): string {
    return createID("s");
}

export function createObjectID(): string {
    return createID("o");
}
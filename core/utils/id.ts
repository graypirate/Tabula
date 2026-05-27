import { randomUUID } from "node:crypto";

export const ObjectPrefix: string = "o";
export const SiloPrefix: string = "s";

// HELPER: Creates a unique ID with the given prefix
function createID(prefix: string): string {
    const random = randomUUID().replaceAll("-", "").slice(0, 4);
    return `${prefix}_${random}`;
}

export function createSiloID(): string {
    return createID(SiloPrefix);
}

export function createObjectID(): string {
    return createID(ObjectPrefix);
}
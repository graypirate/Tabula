import type { DatabaseID } from "./database";
import type { Obj } from "../types/object"

export type SiloID = string;

// Represents a Silo with an ID, name, and optional properties
export interface SiloMetadata {
    readonly id: SiloID;
    parentID: DatabaseID | SiloID;
    name: string;
    properties?: Record<string, unknown>;
}

export interface Silo {
    frontmatter: SiloMetadata;
    objects: Obj[];
    silos: Silo[];
}

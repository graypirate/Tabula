import type { Obj } from "../types/object"

export type SiloID = string;

// Represents a Silo with an ID, name, and optional properties
export interface SiloFrontmatter {
    readonly id: SiloID;
    name: string;
    properties?: Record<string, any>;
}

export interface Silo {
    frontmatter: SiloFrontmatter;
    objects: Obj[];
    silos: Silo[];
}
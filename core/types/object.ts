import type { Block } from "./block";
import type { DatabaseID } from "./database";
import type { SiloID } from "./silo";

export type ObjID = string;

// Represents an Object with an ID, name, and optional properties
export interface ObjMetadata {
    readonly id: ObjID;
    parentID: DatabaseID | SiloID;
    name: string;
    properties?: Record<string, unknown>;
}

export interface Obj extends ObjMetadata {
    blocks: Block[];
}

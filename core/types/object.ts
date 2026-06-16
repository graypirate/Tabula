import type { ObjectBlock } from "./block";
import type { DatabaseID } from "./database";
import type { SiloID } from "./silo";

export type ObjID = string;

export interface ObjMetadata {
    readonly id: ObjID;
    parentID: DatabaseID | SiloID;
    name: string;
    properties?: Record<string, unknown>;
}

// Recursive structure
export interface Obj extends ObjMetadata {
    blocks: ObjectBlock[];
}

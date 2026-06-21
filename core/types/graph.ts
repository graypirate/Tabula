import type { Block, BlockID } from "./block";
import type { DatabaseID } from "./database";
import type { Obj, ObjID } from "./object";

export type EntityType = "object" | "block";
export type EntityID = ObjID | BlockID;
export type Entity = Obj | Block;

export interface EntityReference {
    readonly type: EntityType;
    readonly id: EntityID;
}

export type EntityParentID = DatabaseID | EntityID | null;

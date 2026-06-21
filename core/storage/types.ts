// This file defines the internal stored rows for concrete entity tables.

import type { BlockMetadata } from "../types/block";
import type { DatabaseID } from "../types/database";
import type { EntityID, EntityType } from "../types/graph";
import type { ObjMetadata } from "../types/object";

export type StoredEntityType = "database" | EntityType;
export type StoredEntityID = DatabaseID | EntityID;

export interface StoredEntityReference {
    readonly type: StoredEntityType;
    readonly id: StoredEntityID;
}

export type StoredObject = ObjMetadata;

export interface StoredBlock extends BlockMetadata {
    content: string;
}

export type StoredEntity = StoredObject | StoredBlock;

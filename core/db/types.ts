// This file defines the internal flat stored schema for entities placed in the database

import type { Block, BlockID } from "../types/block";
import type { ObjMetadata } from "../types/object";

export interface StoredObject extends ObjMetadata {
    blocks: StoredObjectBlock[];
}

export interface StoredObjectBlock extends Block {
    parentBlockID?: BlockID;
    position: number;
}

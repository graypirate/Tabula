import type { Entity } from "./graph";
import type { JSONRecord } from "./json";

export type BlockID = string;

export interface BlockMetadata {
    readonly id: BlockID;
    readonly type: "block";
    properties?: JSONRecord;
}

export interface Block extends BlockMetadata {
    content: string;
    children: Entity[];
}

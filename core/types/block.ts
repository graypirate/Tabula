import type { ObjID } from "./object";

export type BlockID = string;

// Represents a Block with an ID, content, and optional properties
export interface BlockMetadata {
    readonly id: BlockID;
    parentID: ObjID | BlockID;
    position: number;
    properties?: Record<string, unknown>;
}

export interface Block extends BlockMetadata {
    content: string;
}

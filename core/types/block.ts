export type BlockID = string;

export interface BlockMetadata {
    readonly id: BlockID;
    readonly type: "block";
    properties?: Record<string, unknown>;
}

export interface Block extends BlockMetadata {
    content: string;
    children: import("./graph").Entity[];
}

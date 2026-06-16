export type BlockID = string;

export interface BlockMetadata {
    readonly id: BlockID;
    properties?: Record<string, unknown>;
}

export interface Block extends BlockMetadata {
    content: string;
}

// Recursive structure
export interface ObjectBlock extends Block {
    children: ObjectBlock[];
}

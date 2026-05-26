
export type ObjID = string;

// Represents an Object with an ID, name, and optional properties
export interface ObjFrontmatter {
    readonly id: ObjID;
    name: string;
    properties?: Record<string, any>;
}

export interface Obj extends ObjFrontmatter {
    body: string;
}
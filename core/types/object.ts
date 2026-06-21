import type { Entity } from "./entity";

export type ObjID = string;

export interface ObjMetadata {
    readonly id: ObjID;
    readonly type: "object";
    name: string;
    properties?: Record<string, unknown>;
}

export interface Obj extends ObjMetadata {
    children: Entity[];
}

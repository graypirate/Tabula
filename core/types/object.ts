import type { Entity } from "./graph";
import type { JSONRecord } from "./json";

export type ObjID = string;

export interface ObjMetadata {
    readonly id: ObjID;
    readonly type: "object";
    name: string;
    properties?: JSONRecord;
}

export interface Obj extends ObjMetadata {
    children: Entity[];
}

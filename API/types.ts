import type { Block, BlockID } from "../core/types/block";
import type { Entity, EntityParentID } from "../core/types/graph";
import type { Obj, ObjID } from "../core/types/object";

export type { EntityParentID } from "../core/types/graph";

// Create types

export type ObjectCreate = Omit<Obj, "id" | "children">;

export type BlockCreate = Omit<Block, "id" | "children">;

export type Create = ObjectCreate | BlockCreate;

// Read types

export interface Result<T extends Entity = Entity> {
    parentID: EntityParentID | null;
    entity: T;
}

export type ObjectResult = Result<Obj>;
export type BlockResult = Result<Block>;

// Write types

export type Write = ObjectWrite | BlockWrite;

export type BlockWrite = Omit<Block, "id" | "children"> & {
    id?: BlockID;
    children: Write[];
};

export type ObjectWrite = Omit<Obj, "id" | "children"> & {
    id?: ObjID;
    children: Write[];
};

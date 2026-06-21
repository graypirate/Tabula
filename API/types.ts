import type { Block, BlockMetadata } from "../core/types/block";
import type {
    Entity,
    EntityParentID,
    EntityReference,
} from "../core/types/entity";
import type { Obj, ObjMetadata } from "../core/types/object";

export type { EntityParentID } from "../core/types/entity";

export type Properties = Record<string, unknown>;
export type EntityMetadata = ObjMetadata | BlockMetadata;

export interface EntityCreateOptions {
    parentID?: NonNullable<EntityParentID>;
}

export type ObjectCreate = {
    type: "object";
    name: string;
    properties?: Properties;
};

export type BlockCreate = {
    type: "block";
    content: string;
    properties?: Properties;
};

export type EntityCreate = ObjectCreate | BlockCreate;

export interface EntityResult<T extends Entity = Entity> {
    parentID: EntityParentID | null;
    entity: T;
}

export type ObjectResult = EntityResult<Obj>;
export type BlockResult = EntityResult<Block>;

export interface EntityList<TMetadata extends EntityMetadata = EntityMetadata> {
    parentID: EntityParentID | null;
    metadata: TMetadata;
    children: EntityReference[];
}

export type ObjectList = EntityList<ObjMetadata>;
export type BlockList = EntityList<BlockMetadata>;

/**
 * Builds a shallow reference for an object or block.
 * @param entity - The recursive entity to reference
 * @returns The entity type and ID
 */
export function entityReference(entity: Entity): EntityReference {
    return {
        type: entity.type,
        id: entity.id,
    };
}

/**
 * Builds shallow references for a list of objects or blocks.
 * @param entities - The recursive entities to reference
 * @returns Ordered entity type and ID references
 */
export function entityReferences(entities: Entity[]): EntityReference[] {
    return entities.map(entityReference);
}

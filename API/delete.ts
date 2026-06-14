import type { Database } from "bun:sqlite";

import { deleteBlock as deleteStoredBlock } from "../core/db/blocks";
import { deleteObject as deleteStoredObject } from "../core/db/objects";
import { deleteSilo as deleteStoredSilo } from "../core/db/silos";
import type { BlockID } from "../core/types/block";
import type { ObjID } from "../core/types/object";
import type { SiloID } from "../core/types/silo";

export function deleteSilo(db: Database, siloID: SiloID): boolean {
    return deleteStoredSilo(db, siloID);
}

export function deleteObject(db: Database, objectID: ObjID): boolean {
    return deleteStoredObject(db, objectID);
}

export function deleteBlock(db: Database, blockID: BlockID): boolean {
    return deleteStoredBlock(db, blockID);
}

export type DatabaseID = string;

// Represents the metadata associated with a database
export interface DBMetadata {
    readonly id: DatabaseID;
    name?: string;
    schemaVersion: number;
}

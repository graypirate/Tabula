export type WorkspaceID = string;

// Represents the public metadata for a Tabula workspace.
export interface WorkspaceMetadata {
    readonly id: WorkspaceID;
    name?: string;
    schemaVersion: string;
}

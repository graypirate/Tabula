CREATE TABLE IF NOT EXISTS "database" (
    id TEXT PRIMARY KEY
        REFERENCES nodes(id)
        ON DELETE RESTRICT
        DEFERRABLE INITIALLY DEFERRED,
    name TEXT,
    schema_version TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS database_singleton_insert
BEFORE INSERT ON "database"
WHEN (SELECT COUNT(*) FROM "database") >= 1
BEGIN
    SELECT RAISE(ABORT, 'database metadata already exists');
END;

CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('database', 'object', 'block'))
);

CREATE TABLE IF NOT EXISTS objects (
    id TEXT PRIMARY KEY
        REFERENCES nodes(id)
        ON DELETE CASCADE
        DEFERRABLE INITIALLY DEFERRED,
    name TEXT NOT NULL,
    properties TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties))
);

CREATE TABLE IF NOT EXISTS blocks (
    id TEXT PRIMARY KEY
        REFERENCES nodes(id)
        ON DELETE CASCADE
        DEFERRABLE INITIALLY DEFERRED,
    content TEXT NOT NULL,
    properties TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties))
);

CREATE TABLE IF NOT EXISTS edges (
    parent_id TEXT NOT NULL
        REFERENCES nodes(id)
        ON DELETE CASCADE
        DEFERRABLE INITIALLY DEFERRED,
    child_id TEXT NOT NULL
        REFERENCES nodes(id)
        ON DELETE CASCADE
        DEFERRABLE INITIALLY DEFERRED,
    position INTEGER NOT NULL CHECK (position >= 0),
    PRIMARY KEY (parent_id, child_id),
    UNIQUE (child_id),
    UNIQUE (parent_id, position),
    CHECK (parent_id <> child_id)
);

CREATE INDEX IF NOT EXISTS edges_parent_id_idx
ON edges(parent_id);

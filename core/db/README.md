# Database Schema

One SQLite database file represents one database. The database contains one
metadata row and separate tables for silos, objects, and blocks.

Every persisted entity except the database itself has a required parent:

- A silo parent is the database or another silo.
- An object parent is the database or a silo.
- A block parent is an object or another block.

IDs are stable primary keys:

- `d_` for databases
- `s_` for silos
- `o_` for objects
- `b_` for blocks

## Database

```sql
CREATE TABLE "database" (
    id TEXT PRIMARY KEY,
    name TEXT,
    schema_version INTEGER NOT NULL
);
```

The table contains exactly one row. The name is optional.

## Silos

```sql
CREATE TABLE silos (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL,
    name TEXT NOT NULL,
    properties TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties))
);

CREATE INDEX silos_parent_id_idx
ON silos(parent_id);
```

`parent_id` must resolve to the database or another silo.

## Objects

```sql
CREATE TABLE objects (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL,
    name TEXT NOT NULL,
    properties TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties))
);

CREATE INDEX objects_parent_id_idx
ON objects(parent_id);
```

`parent_id` must resolve to the database or a silo. Object content is compiled
from descendant rows in `blocks`.

## Blocks

```sql
CREATE TABLE blocks (
    id TEXT PRIMARY KEY,
    parent_id TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    content TEXT NOT NULL,
    properties TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties)),
    UNIQUE (parent_id, position)
);

CREATE INDEX blocks_parent_position_idx
ON blocks(parent_id, position);
```

`parent_id` must resolve to an object or another block. Because block parents
are polymorphic, storage code validates parent existence, ownership, and
cycles.

## Lookup Behavior

Direct entity lookup uses primary-key indexes:

```sql
SELECT * FROM silos WHERE id = ?;
SELECT * FROM objects WHERE id = ?;
SELECT * FROM blocks WHERE id = ?;
```

Direct children use parent indexes:

```sql
SELECT * FROM silos WHERE parent_id = ?;
SELECT * FROM objects WHERE parent_id = ?;
SELECT * FROM blocks WHERE parent_id = ? ORDER BY position;
```

Complete block trees are read with a recursive CTE and returned in depth-first
preorder.

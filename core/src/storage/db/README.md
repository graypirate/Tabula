# Database Schema

One SQLite database file represents one Tabula workspace. The workspace contains
one metadata row, a base `nodes` table with a row for the database itself,
subtype tables for objects and blocks, and one ordered containment table.

IDs are stable primary keys:

- `d_` for workspaces
- `o_` for objects
- `b_` for blocks

## Database

```sql
CREATE TABLE "database" (
    id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE RESTRICT,
    name TEXT,
    schema_version TEXT NOT NULL
);
```

The table contains exactly one row, and that row has a matching `nodes` row
with type `database`. The name is optional. New workspaces use schema version
`0.0.3`. Initialization rejects workspaces whose metadata declares another
version; migrations are not currently supported.

## Nodes

```sql
CREATE TABLE nodes (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('database', 'object', 'block'))
);
```

Workspaces, objects, and blocks share this base table so containment edges can
point at a database, object, or block parent while object and block subtype data
remains in concrete tables.

## Objects

```sql
CREATE TABLE objects (
    id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    properties TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties))
);
```

Objects do not store a parent column. Workspace roots are represented by
`edges` rows whose parent is the workspace ID. Workspace roots must be
objects. Moving an object to the workspace root removes its previous parent
edge.

## Blocks

```sql
CREATE TABLE blocks (
    id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    properties TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties))
);
```

Blocks store plain text content and properties. Child objects or blocks are not
embedded in `content`; they are stored as containment edges.

## Containment

```sql
CREATE TABLE edges (
    parent_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    child_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    PRIMARY KEY (parent_id, child_id),
    UNIQUE (child_id),
    UNIQUE (parent_id, position),
    CHECK (parent_id <> child_id)
);
```

`edges` stores ordered containment edges. Each child entity has at
most one parent, enforced by `UNIQUE (child_id)`. Attaching an existing child
under a new parent moves it by deleting its prior parent edge. Objects and
blocks can both parent objects or blocks. The database may parent objects only;
databases cannot be child entities, and legacy orphan entities may have no
parent edge.

Code validates parent existence, database-root rules, duplicate siblings under
the same parent, attempts to place one child under two submitted parents, and
cycles before committing containment replacement.

## Lookup Behavior

Direct entity lookup uses primary-key indexes:

```sql
SELECT * FROM objects WHERE id = ?;
SELECT * FROM blocks WHERE id = ?;
```

Direct children are read from the parent index:

```sql
SELECT * FROM edges WHERE parent_id = ? ORDER BY position;
```

Recursive reads walk `edges` and hydrate each child from its subtype
table. Replacement writes treat submitted `children` arrays as complete for
each submitted entity: omitted children are recursively deleted. When an
existing entity is submitted under a new parent, its old parent edge is removed
and its submitted children replace its previous direct children.

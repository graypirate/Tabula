# Database Schema

One SQLite database file represents one AgentDB database. The database contains
one metadata row, a base `entities` table with a row for the database itself,
subtype tables for objects and blocks, and one ordered containment table.

IDs are stable primary keys:

- `d_` for databases
- `o_` for objects
- `b_` for blocks

## Database

```sql
CREATE TABLE "database" (
    id TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE RESTRICT,
    name TEXT,
    schema_version TEXT NOT NULL
);
```

The table contains exactly one row, and that row has a matching `entities` row
with type `database`. The name is optional. New databases use schema version
`0.2.0`. Initialization rejects databases whose metadata declares another
version; migrations are not currently supported.

## Entities

```sql
CREATE TABLE entities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('database', 'object', 'block'))
);
```

Databases, objects, and blocks share this base table so containment edges can
point at a database, object, or block parent while object and block subtype data
remains in concrete tables.

## Objects

```sql
CREATE TABLE objects (
    id TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    properties TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties))
);
```

Objects do not store a parent column. Database roots are represented by
`entity_children` rows whose parent is the database ID. Database roots must be
objects. Moving an object to the database root removes its previous parent
edge.

## Blocks

```sql
CREATE TABLE blocks (
    id TEXT PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    properties TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(properties))
);
```

Blocks store plain text content and properties. Child objects or blocks are not
embedded in `content`; they are stored as containment edges.

## Containment

```sql
CREATE TABLE entity_children (
    parent_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    child_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    PRIMARY KEY (parent_id, child_id),
    UNIQUE (child_id),
    UNIQUE (parent_id, position),
    CHECK (parent_id <> child_id)
);
```

`entity_children` stores ordered containment edges. Each child entity has at
most one parent, enforced by `UNIQUE (child_id)`. Attaching an existing child
under a new parent moves it by deleting its prior parent edge. Objects and
blocks can both parent objects or blocks. The database may parent objects only;
databases cannot be child entities, and standalone blocks have no database
edge.

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
SELECT * FROM entity_children WHERE parent_id = ? ORDER BY position;
```

Recursive reads walk `entity_children` and hydrate each child from its subtype
table. Replacement writes treat submitted `children` arrays as complete for
each submitted entity: omitted children are detached from that entity, but their
entity records remain stored. When an existing entity is submitted under a new
parent, its old parent edge is removed and its submitted children replace its
previous direct children.

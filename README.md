# AgentDB

AgentDB is a local SQLite store for one database entity containing objects and
blocks. The API exposes objects and blocks as recursive entity trees. SQLite
stores ordered containment as explicit single-parent edges.

## Setup

```bash
bun install
```

Run the CLI directly during development:

```bash
bun CLI/index.ts init --database ./workspace.sqlite --name "Workspace"
```

`package.json` also exposes `CLI/index.ts` as the `agentdb` binary for linked or
installed use. The examples below use `agentdb`; replace it with
`bun CLI/index.ts` when running from the repository.

## CLI

Every command requires an explicit database path. Entity types are inferred
from their ID prefixes:

- `d_`: database
- `o_`: object
- `b_`: block

Only long options such as `--database` are supported.

### Initialize

```bash
agentdb init --database ./workspace.sqlite --name "Workspace"
```

Initialization returns the database metadata, including the generated database
ID used when reading or listing the database.

### Quick Creation

Create empty objects and standalone blocks using flags:

```bash
agentdb create object \
  --database ./workspace.sqlite \
  --name "CLI Implementation" \
  --property priority=1

agentdb create block \
  --database ./workspace.sqlite \
  --content "Standalone block content" \
  --property draft=true

agentdb create block \
  --database ./workspace.sqlite \
  --content "Child block content" \
  --parent o_parent
```

Repeat `--property key=value` to add properties. Values are parsed as JSON when
valid, so numbers, booleans, arrays, objects, and quoted strings retain their
types. Other values remain strings.

Without `--parent`, `create object` creates a database-root object and `create
block` creates a standalone block. `--parent ID` appends the created entity to
an existing object or block. Objects may also use the database ID as their
parent; blocks may not. Use `write` to create an object or block with nested
content.

### Write Objects And Blocks

`write` reads one JSON object from stdin. It accepts either a recursive object
or a standalone block:

```bash
agentdb write --database ./workspace.sqlite <<'JSON'
{
  "type": "object",
  "name": "AgentDB Architecture",
  "properties": {
    "status": "active"
  },
  "children": [
    {
      "type": "block",
      "content": "Objects expose recursive entity trees.",
      "children": [
        {
          "type": "block",
          "content": "Array order determines sibling order.",
          "children": []
        }
      ]
    }
  ]
}
JSON
```

Objects and blocks both use `children`. Every entity includes `type:
"object"` or `type: "block"`. New object and block IDs are omitted, not set to
`null`. Write input JSON is only the recursive entity. Returned JSON wraps the
stored entity as `{ "parentID": "...", "entity": ... }`, so parent placement is
top-level metadata and recursive children remain free of `parentID`.

An omitted root ID creates an entity. A supplied root ID replaces that object or
block:

```bash
agentdb write --database ./workspace.sqlite <<'JSON'
{
  "id": "b_example",
  "type": "block",
  "content": "Updated standalone content",
  "properties": {
    "version": 2
  },
  "children": []
}
JSON
```

Replacement is complete for every submitted entity's direct children: children
omitted from the input are detached from that entity, but their entity records
remain stored. Supplying an existing child ID moves that entity from its current
parent into the submitted tree, updates it, and replaces that moved entity's
submitted children.

### Read And List

```bash
agentdb read o_example --database ./workspace.sqlite
agentdb list d_example --database ./workspace.sqlite
agentdb list o_example --database ./workspace.sqlite
agentdb list b_example --database ./workspace.sqlite
```

`read` returns `{ "parentID": string | null, "entity": ... }`. The nested
`entity` is the complete recursive object or block shape accepted by `write`.

`list` returns shape only:

- Databases list their direct object IDs.
- Objects list their ordered direct child IDs.
- Blocks list their ordered direct child IDs.

When reading or listing a database ID, it must match the database stored at the
provided path.

### Search And Delete

```bash
agentdb search "recursive trees" --database ./workspace.sqlite
agentdb search "recursive trees" --database ./workspace.sqlite --type block

agentdb delete b_example --database ./workspace.sqlite
agentdb delete o_example --database ./workspace.sqlite
```

Search checks object names and properties, plus block content and properties.
Use `--type object|block` to restrict results.

Delete returns `true` when the entity existed and was deleted. Database-file
deletion is intentionally unsupported by the CLI.

### Output And Errors

Successful commands write one compact JSON value followed by a newline to
stdout and exit with code `0`.

CLI syntax and JSON validation failures write structured JSON to stderr and
exit with code `2`. Database and API operation failures use exit code `1`:

```json
{"error":{"code":"MISSING_OPTION","message":"Required option missing: --database"}}
```

Errors may also include a `details` object. The CLI never writes diagnostics to
stdout.

## Object Type Boundary

`core/types` defines the public entity shapes exported by the API. Objects and
blocks both include a discriminating `type` and recursive `children`.

Storage-only `StoredObject` and `StoredBlock` types live in `core/storage/types.ts`.
The global containment table is internal and is not exposed as a client-facing
placement shape.

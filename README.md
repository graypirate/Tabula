# AgentDB

AgentDB is a local SQLite store for silos, objects, and reusable blocks. The API
exposes objects as recursive block trees, while SQLite placement details remain
internal.

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
- `s_`: silo
- `o_`: object
- `b_`: block

Only long options such as `--database` are supported.

### Initialize

```bash
agentdb init --database ./workspace.sqlite --name "Workspace"
```

Initialization returns the database metadata, including the generated database
ID required when creating top-level silos or objects.

### Quick Creation

Create silos, empty objects, and standalone blocks using flags:

```bash
agentdb create silo \
  --database ./workspace.sqlite \
  --parent d_example \
  --name "Projects" \
  --property 'status="active"'

agentdb create object \
  --database ./workspace.sqlite \
  --parent s_example \
  --name "CLI Implementation" \
  --property priority=1

agentdb create block \
  --database ./workspace.sqlite \
  --content "Reusable block content" \
  --property reusable=true
```

Repeat `--property key=value` to add properties. Values are parsed as JSON when
valid, so numbers, booleans, arrays, objects, and quoted strings retain their
types. Other values remain strings.

`create object` creates an object with an empty `blocks` array. Use `write` to
create an object with content.

### Write Objects And Blocks

`write` reads one JSON object from stdin. It accepts either a recursive object
or a standalone block:

```bash
agentdb write --database ./workspace.sqlite <<'JSON'
{
  "parentID": "s_example",
  "name": "AgentDB Architecture",
  "properties": {
    "status": "active"
  },
  "blocks": [
    {
      "content": "Objects expose recursive block trees.",
      "children": [
        {
          "content": "Array order determines sibling order.",
          "children": []
        }
      ]
    }
  ]
}
JSON
```

Object roots use `blocks`; nested blocks use `children`. New object and block
IDs are omitted, not set to `null`. Returned JSON contains every generated ID.

An omitted root ID creates an entity. A supplied root ID replaces that object
or block:

```bash
agentdb write --database ./workspace.sqlite <<'JSON'
{
  "id": "b_example",
  "content": "Updated standalone content",
  "properties": {
    "version": 2
  }
}
JSON
```

Object replacement is complete: blocks omitted from the input are removed from
that object's placement tree, but their canonical block records remain stored.

### Read And List

```bash
agentdb get o_example --database ./workspace.sqlite
agentdb list d_example --database ./workspace.sqlite
agentdb list s_example --database ./workspace.sqlite
agentdb list o_example --database ./workspace.sqlite
agentdb list b_example --database ./workspace.sqlite --object o_example
```

`get` returns the complete entity. Object reads return the same recursive shape
accepted by `write`, allowing direct read-edit-write round trips.

`list` returns metadata and direct children:

- Databases and silos list their direct silo and object IDs.
- Objects list their top-level block IDs.
- Blocks list metadata only unless `--object` is supplied.
- A block listed with `--object` also returns its ancestors and direct children
  within that object's placement tree.

When getting or listing a database ID, it must match the database stored at the
provided path.

### Search And Delete

```bash
agentdb search "recursive trees" --database ./workspace.sqlite
agentdb search "recursive trees" --database ./workspace.sqlite --type block

agentdb delete b_example --database ./workspace.sqlite
agentdb delete o_example --database ./workspace.sqlite
agentdb delete s_example --database ./workspace.sqlite
```

Search checks silo and object names and properties, plus block content and
properties. Use `--type silo|object|block` to restrict results.

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

The original `Block`, `Obj`, and `ObjectBlock` types represented SQLite storage
data. They were renamed to `StoredBlock`, `StoredObject`, and `BlockPlacement`
so the API can use the generic names for its client-facing model. Flat
placements remain internal because they map directly to SQLite.

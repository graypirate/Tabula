# AgentDB

AgentDB stores one workspace in a local SQLite database file. A workspace
contains objects and blocks. The API exposes objects and blocks as recursive
entity trees, while SQLite stores ordered containment as explicit single-parent
edges.

## Setup

```bash
bun install
```

Installation creates the managed storage directory at `~/.agentdb`. It does not
create any SQLite database files; `init` creates `~/.agentdb/<name>.sqlite`.

Run the CLI directly during development:

```bash
bun CLI/index.ts init --workspace workspace
```

`package.json` also exposes `CLI/index.ts` as the `agentdb` binary for linked or
installed use. The examples below use `agentdb`; replace it with
`bun CLI/index.ts` when running from the repository.

## CLI

Every command requires an explicit workspace name. The CLI stores workspace
SQLite databases in `~/.agentdb/<name>.sqlite`; it does not accept arbitrary
database paths. Entity
types are inferred from their ID prefixes:

- `d_`: workspace
- `o_`: object
- `b_`: block

Only long options such as `--workspace` are supported. Workspace names may contain
letters, numbers, underscores, hyphens, and dots, and must not start with a dot.

### Initialize

```bash
agentdb init --workspace workspace
```

Initialization returns the workspace metadata, including the generated workspace
ID used when reading or listing the workspace. The workspace metadata name is the
same value passed to `--workspace`.

### Quick Creation

Create empty objects and child blocks using flags:

```bash
agentdb create object \
  --workspace workspace \
  --name "CLI Implementation" \
  --property priority=1

agentdb create block \
  --workspace workspace \
  --content "Child block content" \
  --parent o_parent
```

Repeat `--property key=value` to add properties. Values are parsed as JSON when
valid, so numbers, booleans, arrays, objects, and quoted strings retain their
types. Other values remain strings.

Without `--parent`, `create object` creates a workspace-root object. Blocks
require `--parent ID` and are appended under an existing object or block.
Objects may also use the workspace ID as their parent; blocks may not. Use
`write` to create an object or block with nested content.

### Write Objects And Blocks

`write` reads one JSON object from stdin. Object roots may omit `--parent` and
become workspace-root objects. Block roots require `--parent ID`:

```bash
agentdb write --workspace workspace <<'JSON'
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
block. Block roots require `--parent ID`:

```bash
agentdb write --workspace workspace --parent o_parent <<'JSON'
{
  "id": "b_example",
  "type": "block",
  "content": "Updated child content",
  "properties": {
    "version": 2
  },
  "children": []
}
JSON
```

Replacement is complete for every submitted entity's direct children: omitted
children are recursively deleted. Supplying an existing child ID moves that
entity from its current parent into the submitted tree, updates it, and replaces
that moved entity's submitted children.

### Read And List

```bash
agentdb read o_example --workspace workspace
agentdb list d_example --workspace workspace
agentdb list o_example --workspace workspace
agentdb list b_example --workspace workspace
```

`read` returns `{ "parentID": string | null, "entity": ... }`. The nested
`entity` is the complete recursive object or block shape accepted by `write`.

`list` returns shape only:

- Workspaces list their direct object IDs.
- Objects list their ordered direct child IDs.
- Blocks list their ordered direct child IDs.

When reading or listing a workspace ID, it must match the workspace opened by
the provided workspace name.

### Search And Delete

```bash
agentdb search "recursive trees" --workspace workspace
agentdb search "recursive trees" --workspace workspace --type block

agentdb delete b_example --workspace workspace
agentdb delete o_example --workspace workspace
```

Search checks object names and properties, plus block content and properties.
Use `--type object|block` to restrict results.

Delete returns `true` when the entity existed and was deleted. Workspace-file
deletion is intentionally unsupported by the CLI.

### Output And Errors

Successful commands write one compact JSON value followed by a newline to
stdout and exit with code `0`.

CLI syntax and JSON validation failures write structured JSON to stderr and
exit with code `2`. Workspace and API operation failures use exit code `1`:

```json
{"error":{"code":"MISSING_OPTION","message":"Required option missing: --workspace"}}
```

Errors may also include a `details` object. The CLI never writes diagnostics to
stdout.

## Object Type Boundary

The public API accepts workspace names, not SQLite paths. Storage-level database
path handling is internal to `core/storage`.

`core/types` defines the public entity shapes exported by the API. Objects and
blocks both include a discriminating `type` and recursive `children`.

Storage-only `StoredObject` and `StoredBlock` types live in `core/storage/types.ts`.
The global containment table is internal and is not exposed as a client-facing
placement shape.

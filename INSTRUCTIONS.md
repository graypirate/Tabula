# Tabula Client Instructions

This is Tabula, a flexible workspace for storing context as object-oriented components.

The repository is a Bun workspace with the Core package under `core/` and
the optional MCP adapter under `mcp/`. Installed commands are `tabula` and
`tabula-mcp`.

## Overview
Tabula operates on workspaces.
Workspaces are structured containers of flexible entities called Objects and Blocks. Objects and Blocks may parent one another recursively.


Commands that operate inside one workspace require `--workspace NAME`.
The package initializes managed storage at `~/.tabula`, and workspaces resolve
to `~/.tabula/<name>.sqlite`. Clients pass names, not SQLite paths.

You should NEVER query workspace SQLite files directly. Use only the public API,
CLI, or MCP tools. Direct file manipulation can break a workspace.

## MCP

Install `tabula-mcp` separately from `tabula`. MCP clients launch the
`tabula-mcp` command over stdio with no arguments. The adapter must import
Tabula only through the public `tabula` package API.

## Workspaces
Workspace names may contain letters, numbers, underscores, hyphens, and dots.
They must not start with a dot and must not include path separators.

Only Objects may be stored at the root of the workspace. You can use Objects to organize children like folders in a filesystem.

Entity IDs determine type:

- `d_...` workspace
- `o_...` object
- `b_...` block

## Commands

```bash
tabula init --workspace NAME
tabula create ENTITY_TYPE --workspace NAME [--name OBJECT_NAME | --content TEXT] [--parent ID] [--property key=value]
tabula write --workspace NAME [--parent ID] < entity.json
tabula read --workspace NAME
tabula read ID --workspace NAME
tabula list
tabula list --workspace NAME
tabula list ID --workspace NAME
tabula search QUERY --workspace NAME [--type object|block]
tabula delete --workspace NAME
tabula delete ID --workspace NAME
```

`init` creates a managed workspace if needed and returns workspace metadata.
For existing workspaces, it opens the workspace and returns the same metadata.

`create` creates one empty entity. `ENTITY_TYPE` must be `object` or `block`.
Objects require `--name`; blocks require `--content`. Without `--parent`,
objects are stored at the workspace root. Blocks require `--parent` and are
appended under an existing object or block. Objects may also be parented by the
workspace ID; blocks may not. Repeat `--property key=value` to add properties.
Values are parsed as JSON when valid; otherwise they remain strings. Duplicate
property keys are invalid.

`write` reads one recursive object or block JSON payload from stdin and creates
or replaces that entity tree. Object roots may omit `--parent` and become
workspace-root objects. Block roots require `--parent ID`. Use `write` for
nested writes, full replacements, or moving existing entities by ID.

`read --workspace NAME` returns workspace metadata. `read ID --workspace NAME`
returns stored data. For object and block IDs, it returns `{ "parentID": string
| null, "entity": ... }` with the full recursive entity tree. For a workspace
ID, it returns workspace metadata only when the ID matches the opened workspace.

`list` without arguments returns all available workspace names.
`list --workspace NAME` returns the workspace's ordered root object IDs.
`list ID --workspace NAME` returns an Object or Block's ordered direct children.
Use entity listing for lightweight shape inspection before reading full trees.

`search` checks object names/properties and block content/properties. Use
`--type object|block` to restrict results. Search returns compact matches with
type, ID, and label; use `read` afterward for full content.

`delete --workspace NAME` deletes the managed workspace SQLite file and SQLite
sidecar files, returning `true`; it errors when the workspace does not exist.
`delete ID --workspace NAME` removes an object or block and its descendants,
returning `true` when an entity was deleted and `false` when no matching entity
existed.
In interactive terminals, delete commands ask for confirmation. Answer `y` or
`yes` to proceed; any other answer cancels and returns `false`. Non-interactive
delete commands do not prompt.

## Stdin

`write` reads exactly one JSON object from stdin. The root must be an object or
block in the public recursive shape:

```json
{
  "type": "object",
  "name": "Example",
  "properties": {},
  "children": [
    {
      "type": "block",
      "content": "Text",
      "children": []
    }
  ]
}
```

Unlike Objects, Blocks do not have names, only `id`, `properties`, `content`, and `children`.

An ID should only be passed for existing entities you wish to overwrite completely. New entities must not include an ID field whatsoever.

Supplying an `id` replaces that entity. Submitted `children` arrays are the
complete ordered child list for each submitted entity. Omitted children are
recursively deleted. Supplying an existing child ID moves that entity into the
submitted tree. Entities may only have one parent.

## Output

Successful commands write one compact JSON value plus a newline to stdout and
exit `0`. Errors write structured JSON to stderr and never to stdout.

Input, syntax, and JSON validation errors exit `2`. Workspace/API operation
errors exit `1`.

```json
{"error":{"code":"MISSING_OPTION","message":"Required option missing: --workspace"}}
```

## Usage Conventions

Use Objects for named containers and Blocks for ordered content. Use
`properties` for structure, labels, types, references, and values that should be
inspected without parsing `content`.

Keep content in one Block when it is usually read, written, moved, or deleted as
one coherent piece.

Create more Blocks only when a smaller unit needs its own ID, metadata,
children, replacement, or move operation.

Nest Blocks only for durable structure, not visual formatting. Prefer shallow
trees for logs, tables, flat notes, and append-only collections; use deeper
trees for documents, outlines, tasks, and grouped records.

Sibling array order is the ordering/display contract.

Examples:

- Spreadsheet/database: use one Object for the table. Store column definitions
  on the Object `properties`. Use one child Block per row/page. Store column
  values on each row Block's `properties`, either under a `columns` key or
  directly as column-keyed properties. Use row Block `content` only for
  information outside the parent-defined columns, such as notes or freeform page
  text.

- Document: use one Object for the document. Use Blocks for sections,
  paragraphs, list items, or embedded data when those parts need separate
  operations or metadata. Keep the document in fewer Blocks when it is normally
  read and written as one continuous piece.

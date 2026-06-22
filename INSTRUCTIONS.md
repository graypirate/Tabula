# AgentDB Client Instructions

This is AgentDB, a hyper-flexible workspace for storing context in as object-oriented components.

AgentDB is currently installed as a CLI, accessible as `agentdb`.

## Overview
AgentDB operates on workspaces.
Workspaces are structured containers of flexible entities called Objects and Blocks. Objects and Blocks may parent one antoher in a recurisve/tree manner.


Commands that operate inside one workspace require `--workspace NAME`.
The package initializes managed storage at `~/.agentdb`, and workspaces resolve
to `~/.agentdb/<name>.sqlite`. Clients pass names, not SQLite paths.

You should NEVER query worksapce SQLite files directly. Use only available commands to operate within the intended functionality. Unintended/direct file manipulations will break a workspace.

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
agentdb init --workspace NAME
agentdb create ENTITY_TYPE --workspace NAME [--name OBJECT_NAME | --content TEXT] [--parent ID] [--property key=value]
agentdb write --workspace NAME < entity.json
agentdb read ID --workspace NAME
agentdb list
agentdb list ID --workspace NAME
agentdb search QUERY --workspace NAME [--type object|block]
agentdb delete ID --workspace NAME
```

`init` creates a managed workspace if needed and returns workspace metadata.
For existing workspaces, it opens the workspace and returns the same metadata.

`create` creates one empty entity. `ENTITY_TYPE` must be `object` or `block`.
Objects require `--name`; blocks require `--content`. Without `--parent`,
objects are stored at the workspace root and blocks are standalone. With
`--parent`, the new entity is appended under an existing object or block.
Objects may also be parented by the workspace ID; blocks may not. Repeat
`--property key=value` to add properties. Values are parsed as JSON when valid;
otherwise they remain strings. Duplicate property keys are invalid.

`write` reads one recursive object or block JSON payload from stdin and creates
or replaces that entity tree. Use it for nested writes, full replacements, or
moving existing entities by ID.

`read` returns stored data. For object and block IDs, it returns `{ "parentID":
string | null, "entity": ... }` with the full recursive entity tree. For a
workspace ID, it returns workspace metadata only when the ID matches the opened
workspace.

`list` without arguments returns all available workspace names.
`list ID --workspace NAME` returns root children IDs.
Listing Objects and Blocks return their ordered direct children.
Use entity listing for lightweight shape inspection before reading full trees.

`search` checks object names/properties and block content/properties. Use
`--type object|block` to restrict results. Search returns compact matches with
type, ID, and label; use `read` afterward for full content.

`delete` removes an object or block and its descendants, returning `true` when
an entity was deleted and `false` when no matching entity existed. Workspace
deletion is not supported.

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
detached from that parent, but not deleted. Supplying an existing child ID moves that
entity into the submitted tree. Entities may only have one parent.

## Output

Successful commands write one compact JSON value plus a newline to stdout and
exit `0`. Errors write structured JSON to stderr and never to stdout.

Input, syntax, and JSON validation errors exit `2`. Workspace/API operation
errors exit `1`.

```json
{"error":{"code":"MISSING_OPTION","message":"Required option missing: --workspace"}}
```

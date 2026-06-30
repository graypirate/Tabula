# Tabula Core

Core API and command-line interface for Tabula.

## Global Installation

Install the Core package and `tabula` CLI with Bun:

```bash
bun add --global @graypirate/tabula
```

Or with npm:

```bash
npm install --global @graypirate/tabula
```

Bun is required at runtime regardless of which package manager installs it.

Verify:
```bash
command -v tabula
tabula list
```

Upgrade or remove the Core package with Bun:
```bash
bun update --global @graypirate/tabula
bun remove --global @graypirate/tabula

# npm equivalents
npm update --global @graypirate/tabula
npm uninstall --global @graypirate/tabula
```

To import the public API in another project, install it as a project dependency:

```bash
bun add @graypirate/tabula
# or
npm install @graypirate/tabula
```

## CLI

Most commands follow one of these forms:
```bash
tabula <command> [arguments] [options]
tabula <command> <subcommand> [arguments] [options]
```

Current command groups:
- `init [options]`
- `list [id] [options]`
- `read [id] [options]`
- `create object [options]`
- `create block [options]`
- `write [options]`
- `search <query> [options]`
- `delete [id] [options]`

Common argument patterns:
- `[id]` is an optional entity identifier for commands that can target either a root context or a specific entity.
- `<query>` is a required search string.
- `[options]` includes flags such as `--workspace`, `--parent`, `--name`, `--content`, `--type`, and repeatable `--property key=value`.

Entity IDs identify their type:
- `d_...`: workspace
- `o_...`: Object
- `b_...`: Block

Commands that operate inside a workspace require `--workspace NAME`.

### Workspaces

```bash
tabula init --workspace example
tabula list
tabula read --workspace example
tabula list --workspace example
tabula delete --workspace example
```

`init` creates or opens `~/.tabula/<name>.sqlite` and returns workspace
metadata. Bare `list` returns managed workspace names. `read --workspace`
returns metadata, while `list --workspace` returns ordered root Object IDs.

Workspace deletion removes the SQLite file and its sidecars. Interactive
terminals ask for confirmation; non-interactive commands do not prompt.

### Create Objects and Blocks

```bash
tabula create object \
  --workspace example \
  --name "Project" \
  --property status=active

tabula create block \
  --workspace example \
  --parent o_parent \
  --content "First task" \
  --property complete=false
```

Objects may be created at the workspace root or under an Object or Block.
Blocks require `--parent`. Repeat `--property key=value` to add properties;
values are parsed as JSON when valid and otherwise remain strings.

### Write Recursive Trees

`write` accepts exactly one recursive Object or Block JSON value from stdin:

```bash
tabula write --workspace example <<'JSON'
{
  "type": "object",
  "name": "Document",
  "properties": { "status": "draft" },
  "children": [
    {
      "type": "block",
      "content": "Introduction",
      "properties": { "level": 1 },
      "children": []
    }
  ]
}
JSON
```

New entities omit `id`. Supplying an existing ID replaces that entity.
Submitted `children` arrays are complete replacements: omitted child subtrees
are deleted. Existing children included by ID may be moved. Object roots may be
written at workspace root; Block roots require `--parent ID`.

### Read, List, Search, and Delete

```bash
tabula read o_example --workspace example
tabula list o_example --workspace example
tabula search "draft" --workspace example
tabula search "draft" --workspace example --type block
tabula delete b_example --workspace example
```

`read ID` returns the parent ID and complete recursive entity tree. `list ID`
returns ordered direct child IDs. `search` checks Object names and properties
plus Block content and properties. Entity deletion removes the entity and all
descendants.

### Output and Errors

Successful commands write one compact JSON value plus a newline to stdout and
exit `0`. Input and validation failures write structured JSON to stderr and
exit `2`; operation failures exit `1`.

```json
{"error":{"code":"MISSING_OPTION","message":"Required option missing: --workspace"}}
```

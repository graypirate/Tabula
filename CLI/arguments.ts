import {
    InvalidWorkspaceNameError,
    validateWorkspaceName,
} from "../core/workspace";
import { CLIInputError } from "./errors.ts";

export type EntityType = "workspace" | "object" | "block";
export type SearchType = Exclude<EntityType, "workspace">;

export type CLICommand =
    | { action: "init"; workspace: string }
    | {
        action: "create";
        entity: "object";
        workspace: string;
        name: string;
        propertyValues: string[];
        parentID?: string;
    }
    | {
        action: "create";
        entity: "block";
        workspace: string;
        content: string;
        propertyValues: string[];
        parentID?: string;
    }
    | { action: "write"; workspace: string }
    | { action: "read"; workspace: string; id: string }
    | { action: "listWorkspaces" }
    | { action: "list"; workspace: string; id: string }
    | { action: "delete"; workspace: string; id: string }
    | { action: "search"; workspace: string; query: string; type?: SearchType };

type ParsedArguments = {
    options: Map<string, string[]>;
    positionals: string[];
};

const optionNames = new Set([
    "content",
    "name",
    "parent",
    "property",
    "type",
    "workspace",
]);

export function parseCommand(argv: string[]): CLICommand {
    const parsed = parseArguments(argv);
    const action = parsed.positionals[0];

    if (action === undefined) {
        throw inputError("INVALID_COMMAND", "Command is required");
    }

    switch (action) {
        case "list": {
            if (parsed.positionals.length === 1) {
                allowOptions(parsed, []);
                return { action: "listWorkspaces" };
            }

            const workspace = requireCommandWorkspace(parsed);
            requirePositionals(parsed, 2, "agentdb list ID --workspace NAME");
            allowOptions(parsed, ["workspace"]);
            const id = parsed.positionals[1]!;
            inferEntityType(id);

            return { action, workspace, id };
        }

        case "init": {
            const workspace = requireCommandWorkspace(parsed);
            requirePositionals(parsed, 1, "agentdb init --workspace NAME");
            allowOptions(parsed, ["workspace"]);
            return {
                action,
                workspace,
            };
        }

        case "create": {
            const workspace = requireCommandWorkspace(parsed);
            return parseCreate(parsed, workspace);
        }

        case "write": {
            const workspace = requireCommandWorkspace(parsed);
            requirePositionals(parsed, 1, "agentdb write --workspace NAME < entity.json");
            allowOptions(parsed, ["workspace"]);
            return { action, workspace };
        }

        case "read": {
            const workspace = requireCommandWorkspace(parsed);
            requirePositionals(parsed, 2, "agentdb read ID --workspace NAME");
            allowOptions(parsed, ["workspace"]);
            const id = parsed.positionals[1]!;
            inferEntityType(id);
            return { action, workspace, id };
        }

        case "delete": {
            const workspace = requireCommandWorkspace(parsed);
            requirePositionals(parsed, 2, "agentdb delete ID --workspace NAME");
            allowOptions(parsed, ["workspace"]);
            const id = parsed.positionals[1]!;
            if (inferEntityType(id) === "workspace") {
                throw inputError("UNSUPPORTED_DELETE", "Workspace deletion is not supported");
            }
            return { action, workspace, id };
        }

        case "search": {
            const workspace = requireCommandWorkspace(parsed);
            requirePositionals(
                parsed,
                2,
                "agentdb search QUERY --workspace NAME [--type object|block]",
            );
            allowOptions(parsed, ["workspace", "type"]);
            const type = optionalSingleOption(parsed, "type");
            if (type !== undefined && !isSearchType(type)) {
                throw inputError(
                    "INVALID_SEARCH_TYPE",
                    `Invalid search type: ${type}`,
                    { allowed: ["object", "block"] },
                );
            }
            return {
                action,
                workspace,
                query: parsed.positionals[1]!,
                ...(type === undefined ? {} : { type }),
            };
        }

        default:
            throw inputError("INVALID_COMMAND", `Unknown command: ${action}`);
    }
}

export function inferEntityType(id: string): EntityType {
    switch (id.slice(0, 2)) {
        case "d_":
            return "workspace";
        case "o_":
            return "object";
        case "b_":
            return "block";
        default:
            throw inputError("INVALID_ID", `Unknown entity ID prefix: ${id}`);
    }
}

function parseCreate(parsed: ParsedArguments, workspace: string): CLICommand {
    requirePositionals(
        parsed,
        2,
        "agentdb create object|block --workspace NAME [options]",
    );

    const entity = parsed.positionals[1];
    switch (entity) {
        case "object": {
            allowOptions(parsed, ["workspace", "name", "parent", "property"]);
            const parentID = optionalCreateParentID(parsed, entity);
            return {
                action: "create",
                entity,
                workspace,
                name: requireSingleOption(parsed, "name"),
                propertyValues: parsed.options.get("property") ?? [],
                ...(parentID === undefined ? {} : { parentID }),
            };
        }

        case "block": {
            allowOptions(parsed, ["workspace", "content", "parent", "property"]);
            const parentID = optionalCreateParentID(parsed, entity);
            return {
                action: "create",
                entity,
                workspace,
                content: requireSingleOption(parsed, "content"),
                propertyValues: parsed.options.get("property") ?? [],
                ...(parentID === undefined ? {} : { parentID }),
            };
        }

        default:
            throw inputError(
                "INVALID_ENTITY_TYPE",
                `Unknown create entity type: ${entity ?? ""}`,
                { allowed: ["object", "block"] },
            );
    }
}

function parseArguments(argv: string[]): ParsedArguments {
    const options = new Map<string, string[]>();
    const positionals: string[] = [];

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index]!;
        if (!argument.startsWith("-")) {
            positionals.push(argument);
            continue;
        }
        if (!argument.startsWith("--")) {
            throw inputError("UNKNOWN_OPTION", `Only long options are supported: ${argument}`);
        }

        const separator = argument.indexOf("=");
        const name = argument.slice(2, separator === -1 ? undefined : separator);
        if (!optionNames.has(name)) {
            throw inputError("UNKNOWN_OPTION", `Unknown option: --${name}`);
        }

        const inlineValue = separator === -1 ? undefined : argument.slice(separator + 1);
        const nextValue = argv[index + 1];
        const value = inlineValue ?? nextValue;
        if (
            value === undefined
            || value.length === 0
            || (inlineValue === undefined && value.startsWith("--"))
        ) {
            throw inputError("MISSING_OPTION_VALUE", `Option --${name} requires a value`);
        }
        if (inlineValue === undefined) {
            index += 1;
        }

        const values = options.get(name) ?? [];
        values.push(value);
        options.set(name, values);
    }

    return { options, positionals };
}

function validateCommandWorkspaceName(workspace: string): void {
    try {
        validateWorkspaceName(workspace);
    } catch (error) {
        if (error instanceof InvalidWorkspaceNameError) {
            throw inputError("INVALID_WORKSPACE_NAME", error.message, error.details);
        }
        throw error;
    }
}

function requireCommandWorkspace(parsed: ParsedArguments): string {
    const workspace = requireSingleOption(parsed, "workspace");
    validateCommandWorkspaceName(workspace);
    return workspace;
}

function allowOptions(parsed: ParsedArguments, allowed: string[]): void {
    const allowedOptions = new Set(allowed);
    for (const name of parsed.options.keys()) {
        if (!allowedOptions.has(name)) {
            throw inputError("INVALID_OPTION", `Option --${name} is not valid for this command`);
        }
    }
}

function requirePositionals(parsed: ParsedArguments, count: number, usage: string): void {
    if (parsed.positionals.length !== count) {
        throw inputError("INVALID_ARGUMENTS", `Usage: ${usage}`);
    }
}

function requireSingleOption(parsed: ParsedArguments, name: string): string {
    const value = optionalSingleOption(parsed, name);
    if (value === undefined) {
        throw inputError("MISSING_OPTION", `Required option missing: --${name}`);
    }
    return value;
}

function optionalSingleOption(parsed: ParsedArguments, name: string): string | undefined {
    const values = parsed.options.get(name);
    if (values === undefined) {
        return undefined;
    }
    if (values.length !== 1) {
        throw inputError("DUPLICATE_OPTION", `Option --${name} may only be specified once`);
    }
    return values[0]!;
}

function optionalCreateParentID(
    parsed: ParsedArguments,
    childType: Exclude<EntityType, "workspace">,
): string | undefined {
    const parentID = optionalSingleOption(parsed, "parent");
    if (parentID === undefined) {
        return undefined;
    }

    const parentType = inferEntityType(parentID);
    if (childType === "block" && parentType === "workspace") {
        throw inputError("INVALID_PARENT", `Workspace parents can only contain objects: ${parentID}`);
    }
    return parentID;
}

function requireEntityType(id: string, expected: EntityType, code = "INVALID_ID"): void {
    if (inferEntityType(id) !== expected) {
        throw inputError(code, `Expected ${expected} ID: ${id}`);
    }
}

function isSearchType(value: string): value is SearchType {
    return value === "object" || value === "block";
}

function inputError(code: string, message: string, details?: unknown): CLIInputError {
    return new CLIInputError(code, message, details);
}

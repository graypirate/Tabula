import { CLIInputError } from "./errors.ts";

export type EntityType = "database" | "object" | "block";
export type SearchType = Exclude<EntityType, "database">;

export type CLICommand =
    | { action: "init"; database: string; name?: string }
    | {
        action: "create";
        entity: "object";
        database: string;
        name: string;
        propertyValues: string[];
        parentID?: string;
    }
    | {
        action: "create";
        entity: "block";
        database: string;
        content: string;
        propertyValues: string[];
        parentID?: string;
    }
    | { action: "write"; database: string }
    | { action: "read"; database: string; id: string }
    | { action: "list"; database: string; id: string }
    | { action: "delete"; database: string; id: string }
    | { action: "search"; database: string; query: string; type?: SearchType };

type ParsedArguments = {
    options: Map<string, string[]>;
    positionals: string[];
};

const optionNames = new Set([
    "content",
    "database",
    "name",
    "parent",
    "property",
    "type",
]);

export function parseCommand(argv: string[]): CLICommand {
    const parsed = parseArguments(argv);
    const action = parsed.positionals[0];

    if (action === undefined) {
        throw inputError("INVALID_COMMAND", "Command is required");
    }

    const database = requireSingleOption(parsed, "database");

    switch (action) {
        case "init": {
            requirePositionals(parsed, 1, "agentdb init --database PATH [--name NAME]");
            allowOptions(parsed, ["database", "name"]);
            const name = optionalSingleOption(parsed, "name");
            return {
                action,
                database,
                ...(name === undefined ? {} : { name }),
            };
        }

        case "create":
            return parseCreate(parsed, database);

        case "write":
            requirePositionals(parsed, 1, "agentdb write --database PATH < entity.json");
            allowOptions(parsed, ["database"]);
            return { action, database };

        case "read": {
            requirePositionals(parsed, 2, "agentdb read ID --database PATH");
            allowOptions(parsed, ["database"]);
            const id = parsed.positionals[1]!;
            inferEntityType(id);
            return { action, database, id };
        }

        case "list": {
            requirePositionals(parsed, 2, "agentdb list ID --database PATH");
            allowOptions(parsed, ["database"]);
            const id = parsed.positionals[1]!;
            inferEntityType(id);

            return { action, database, id };
        }

        case "delete": {
            requirePositionals(parsed, 2, "agentdb delete ID --database PATH");
            allowOptions(parsed, ["database"]);
            const id = parsed.positionals[1]!;
            if (inferEntityType(id) === "database") {
                throw inputError("UNSUPPORTED_DELETE", "Database deletion is not supported");
            }
            return { action, database, id };
        }

        case "search": {
            requirePositionals(
                parsed,
                2,
                "agentdb search QUERY --database PATH [--type object|block]",
            );
            allowOptions(parsed, ["database", "type"]);
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
                database,
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
            return "database";
        case "o_":
            return "object";
        case "b_":
            return "block";
        default:
            throw inputError("INVALID_ID", `Unknown entity ID prefix: ${id}`);
    }
}

function parseCreate(parsed: ParsedArguments, database: string): CLICommand {
    requirePositionals(
        parsed,
        2,
        "agentdb create object|block --database PATH [options]",
    );

    const entity = parsed.positionals[1];
    switch (entity) {
        case "object": {
            allowOptions(parsed, ["database", "name", "parent", "property"]);
            const parentID = optionalCreateParentID(parsed, entity);
            return {
                action: "create",
                entity,
                database,
                name: requireSingleOption(parsed, "name"),
                propertyValues: parsed.options.get("property") ?? [],
                ...(parentID === undefined ? {} : { parentID }),
            };
        }

        case "block": {
            allowOptions(parsed, ["database", "content", "parent", "property"]);
            const parentID = optionalCreateParentID(parsed, entity);
            return {
                action: "create",
                entity,
                database,
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
    childType: Exclude<EntityType, "database">,
): string | undefined {
    const parentID = optionalSingleOption(parsed, "parent");
    if (parentID === undefined) {
        return undefined;
    }

    const parentType = inferEntityType(parentID);
    if (childType === "block" && parentType === "database") {
        throw inputError("INVALID_PARENT", `Database parents can only contain objects: ${parentID}`);
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

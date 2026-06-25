import type { JSONRecord, JSONValue } from "../index.ts";
import { CLIInputError } from "./errors.ts";

export type Properties = JSONRecord;

export function parseProperties(values: string[]): Properties {
    const properties: Properties = {};

    for (const property of values) {
        const separator = property.indexOf("=");
        if (separator < 1) {
            throw new CLIInputError(
                "INVALID_PROPERTY",
                `Property must use key=value syntax: ${property}`,
            );
        }

        const key = property.slice(0, separator);
        if (Object.hasOwn(properties, key)) {
            throw new CLIInputError("DUPLICATE_PROPERTY", `Duplicate property: ${key}`);
        }

        const value = property.slice(separator + 1);
        try {
            properties[key] = JSON.parse(value) as JSONValue;
        } catch {
            properties[key] = value;
        }
    }

    return properties;
}

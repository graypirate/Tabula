export type JSONPrimitive = string | number | boolean | null;

export type JSONValue =
    | JSONPrimitive
    | JSONValue[]
    | { [key: string]: JSONValue };

export type JSONRecord = { [key: string]: JSONValue };

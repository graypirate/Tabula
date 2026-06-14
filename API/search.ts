import type { Database } from "bun:sqlite";

export type SearchType = "silo" | "object" | "block";

export interface SearchResult {
    type: SearchType;
    id: string;
    label: string;
}

type SearchRow = SearchResult;

export function search(
    db: Database,
    query: string,
    type?: SearchType,
): SearchResult[] {
    const types: SearchType[] = type === undefined
        ? ["silo", "object", "block"]
        : [type];
    const rows: SearchRow[] = [];
    const parameters = { $query: query };

    if (types.includes("silo")) {
        rows.push(...db.query(`
            SELECT 'silo' AS type, id, name AS label
            FROM silos
            WHERE instr(lower(name), lower($query)) > 0
               OR instr(lower(properties), lower($query)) > 0
        `).all(parameters) as SearchRow[]);
    }
    if (types.includes("object")) {
        rows.push(...db.query(`
            SELECT 'object' AS type, id, name AS label
            FROM objects
            WHERE instr(lower(name), lower($query)) > 0
               OR instr(lower(properties), lower($query)) > 0
        `).all(parameters) as SearchRow[]);
    }
    if (types.includes("block")) {
        rows.push(...db.query(`
            SELECT 'block' AS type, id, content AS label
            FROM blocks
            WHERE instr(lower(content), lower($query)) > 0
               OR instr(lower(properties), lower($query)) > 0
        `).all(parameters) as SearchRow[]);
    }

    return rows
        .map((row) => ({
            ...row,
            label: row.type === "block" ? blockLabel(row.label) : row.label,
        }))
        .sort((left, right) =>
            left.type.localeCompare(right.type)
            || left.label.localeCompare(right.label)
            || left.id.localeCompare(right.id)
        );
}

/** Converts block content into a compact single-line search label. */
function blockLabel(content: string): string {
    const normalized = content.replace(/\s+/g, " ").trim();
    return normalized.length <= 80 ? normalized : `${normalized.slice(0, 77)}...`;
}

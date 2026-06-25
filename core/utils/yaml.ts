import YAML from "yaml";

import type { JSONRecord } from "../types/json";
import type { ObjMetadata } from "../types/object";

// HELPER - convert frontmatter to a dictionary
function frontmatterToDict(frontmatter: ObjMetadata): JSONRecord {
    const result: JSONRecord = {
        id: frontmatter.id,
        name: frontmatter.name,
    };
    if (frontmatter.properties !== undefined) {
        result.properties = frontmatter.properties;
    }
    return result;
}

export function renderFrontmatter(frontmatter: ObjMetadata): string {
    const dict = frontmatterToDict(frontmatter);
    return `---\n${YAML.stringify(dict)}---\n`;
}

export function parseFrontmatter<T>(markdown: string): T {
    if (!markdown.startsWith("---")) {
        throw new Error("Frontmatter must start with ---");
    }

    const end = markdown.indexOf("\n---", 3);

    if (end === -1) {
        throw new Error("Frontmatter must end with ---");
    }

    return YAML.parse(markdown.slice(4, end)) as T;
}

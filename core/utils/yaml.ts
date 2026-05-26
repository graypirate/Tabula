import YAML from "yaml";

import type { ObjFrontmatter } from "../types/object";
import type { SiloFrontmatter } from "../types/silo";

// HELPER - convert frontmatter to a dictionary
function frontmatterToDict(frontmatter: ObjFrontmatter | SiloFrontmatter): Record<string, unknown> {
    return {
        id: frontmatter.id,
        name: frontmatter.name,
        properties: frontmatter.properties
    };
}

export function renderFrontmatter(frontmatter: ObjFrontmatter | SiloFrontmatter): string {
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

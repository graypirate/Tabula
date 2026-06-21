import { expect, test } from "bun:test";

import { entityReference, entityReferences } from "../../API/types";
import type { Entity } from "../../core/types/entity";

test("builds shallow entity references from recursive entities", () => {
    const entities: Entity[] = [{
        id: "o_one",
        type: "object",
        name: "One",
        properties: {},
        children: [],
    }, {
        id: "b_two",
        type: "block",
        content: "Two",
        properties: {},
        children: [],
    }];

    expect(entityReference(entities[0]!)).toEqual({ type: "object", id: "o_one" });
    expect(entityReferences(entities)).toEqual([
        { type: "object", id: "o_one" },
        { type: "block", id: "b_two" },
    ]);
});

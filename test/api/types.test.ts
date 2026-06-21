import { expect, test } from "bun:test";

import type { Entity } from "../../core/types/graph";

test("public entities can be projected into shallow references", () => {
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

    expect({
        type: entities[0]!.type,
        id: entities[0]!.id,
    }).toEqual({ type: "object", id: "o_one" });
    expect(entities.map((entity) => ({
        type: entity.type,
        id: entity.id,
    }))).toEqual([
        { type: "object", id: "o_one" },
        { type: "block", id: "b_two" },
    ]);
});

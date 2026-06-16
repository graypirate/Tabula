import { expect, test } from "bun:test";

import {
    expandStoredObject,
    expandStoredObjectBlocks,
    flattenObjectBlocks,
} from "../../API/types";
import type { StoredObject } from "../../core/db/types";
import type { ObjectBlock } from "../../core/types/block";

test("expands preorder stored object blocks into recursive object blocks in linear order", () => {
    expect(expandStoredObjectBlocks([
        objectBlock("b_parent", "Parent", undefined, 0),
        objectBlock("b_child", "Child", "b_parent", 0),
        objectBlock("b_grandchild", "Grandchild", "b_child", 0),
        objectBlock("b_second", "Second", undefined, 1),
    ])).toEqual([{
        id: "b_parent",
        content: "Parent",
        properties: {},
        children: [{
            id: "b_child",
            content: "Child",
            properties: {},
            children: [{
                id: "b_grandchild",
                content: "Grandchild",
                properties: {},
                children: [],
            }],
        }],
    }, {
        id: "b_second",
        content: "Second",
        properties: {},
        children: [],
    }]);
});

test("expands a stored object into the public recursive object shape", () => {
    const stored: StoredObject = {
        id: "o_tree",
        parentID: "d_root",
        name: "Tree",
        properties: { status: "draft" },
        blocks: [
            objectBlock("b_parent", "Parent", undefined, 0),
            objectBlock("b_child", "Child", "b_parent", 0),
        ],
    };

    expect(expandStoredObject(stored)).toEqual({
        id: "o_tree",
        parentID: "d_root",
        name: "Tree",
        properties: { status: "draft" },
        blocks: [{
            id: "b_parent",
            content: "Parent",
            properties: {},
            children: [{
                id: "b_child",
                content: "Child",
                properties: {},
                children: [],
            }],
        }],
    });
});

test("flattens recursive object blocks into stored object blocks with positions", () => {
    const blocks: ObjectBlock[] = [{
        id: "b_parent",
        content: "Parent",
        properties: {},
        children: [{
            id: "b_child",
            content: "Child",
            properties: { level: 1 },
            children: [],
        }],
    }, {
        id: "b_second",
        content: "Second",
        properties: {},
        children: [],
    }];

    expect(flattenObjectBlocks(blocks)).toEqual([
        objectBlock("b_parent", "Parent", undefined, 0),
        objectBlock("b_child", "Child", "b_parent", 0, { level: 1 }),
        objectBlock("b_second", "Second", undefined, 1),
    ]);
});

function objectBlock(
    id: string,
    content: string,
    parentBlockID: string | undefined,
    position: number,
    properties: Record<string, unknown> = {},
) {
    return {
        id,
        content,
        properties,
        parentBlockID,
        position,
    };
}

import { expect, test } from "bun:test";

import { readStdin } from "../../CLI/io.ts";

test("commands that do not require stdin never read it", async () => {
    let read = false;

    const input = await readStdin(false, false, async () => {
        read = true;
        return "unexpected";
    });

    expect(input).toBe("");
    expect(read).toBe(false);
});

test("interactive write commands do not wait for stdin EOF", async () => {
    let read = false;

    const input = await readStdin(true, true, async () => {
        read = true;
        return "unexpected";
    });

    expect(input).toBe("");
    expect(read).toBe(false);
});

test("redirected write commands consume stdin", async () => {
    expect(await readStdin(true, false, async () => '{"content":"block"}')).toBe(
        '{"content":"block"}',
    );
});

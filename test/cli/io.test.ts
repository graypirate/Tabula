import { expect, test } from "bun:test";

import { confirmationDialogue, readStdin } from "../../CLI/io.ts";

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

test("confirmation dialogue formats prompts and accepts y or yes", async () => {
    const prompts: string[] = [];

    for (const response of ["y", "Y", "yes", "YES"]) {
        expect(await confirmationDialogue("Delete Test?", {
            isTTY: true,
            readResponse: async (prompt) => {
                prompts.push(prompt);
                return response;
            },
        })).toBe(true);
    }

    expect(prompts).toEqual([
        "Delete Test? (y/n)",
        "Delete Test? (y/n)",
        "Delete Test? (y/n)",
        "Delete Test? (y/n)",
    ]);
});

test("confirmation dialogue rejects every non-approval answer", async () => {
    for (const response of ["n", "", "delete", null]) {
        expect(await confirmationDialogue("Delete Test?", {
            isTTY: true,
            readResponse: async () => response,
        })).toBe(false);
    }
});

test("non-interactive confirmation dialogue skips prompting", async () => {
    let read = false;

    expect(await confirmationDialogue("Delete Test?", {
        isTTY: false,
        readResponse: async () => {
            read = true;
            return "n";
        },
    })).toBe(true);
    expect(read).toBe(false);
});

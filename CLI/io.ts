import { createInterface } from "node:readline/promises";

export type ConfirmationOptions = {
    isTTY?: boolean;
    readResponse?: (prompt: string) => Promise<string | null>;
};

export async function readStdin(
    required: boolean,
    isTTY: boolean | undefined = process.stdin.isTTY,
    read: () => Promise<string> = () => Bun.stdin.text(),
): Promise<string> {
    return required && isTTY !== true ? await read() : "";
}

export async function confirmationDialogue(
    prompt: string,
    options: ConfirmationOptions = {},
): Promise<boolean> {
    const isTTY = options.isTTY ?? process.stdin.isTTY;
    if (isTTY !== true) {
        return true;
    }

    const response = await (options.readResponse ?? readInteractiveResponse)(`${prompt} (y/n)`);
    const normalized = response?.trim().toLowerCase();
    return normalized === "y" || normalized === "yes";
}

async function readInteractiveResponse(prompt: string): Promise<string | null> {
    const readline = createInterface({
        input: process.stdin,
        output: process.stderr,
    });

    try {
        return await readline.question(prompt);
    } catch {
        return null;
    } finally {
        readline.close();
    }
}

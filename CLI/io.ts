export async function readStdin(
    required: boolean,
    isTTY: boolean | undefined = process.stdin.isTTY,
    read: () => Promise<string> = () => Bun.stdin.text(),
): Promise<string> {
    return required && isTTY !== true ? await read() : "";
}

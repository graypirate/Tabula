#!/usr/bin/env bun

import { parseCommand } from "./arguments.ts";
import { dispatchCommand } from "./dispatch.ts";
import { CLIInputError, CLIOperationError } from "./errors.ts";
import { confirmationDialogue, readStdin } from "./io.ts";
import { parseWriteInput } from "./json.ts";

type ErrorOutput = {
    error: {
        code: string;
        message: string;
        details?: unknown;
    };
};

export async function runCLI(
    argv: string[],
    read: () => Promise<string> = () => Bun.stdin.text(),
    isTTY: boolean | undefined = process.stdin.isTTY,
    confirm: (prompt: string) => Promise<boolean> = (prompt) => confirmationDialogue(prompt, { isTTY }),
): Promise<{ exitCode: number; output: unknown; stream: "stdout" | "stderr" }> {
    try {
        const command = parseCommand(argv);
        const input = await readStdin(command.action === "write", isTTY, read);
        const writeInput = command.action === "write" ? parseWriteInput(input) : undefined;
        if (command.action === "delete") {
            const target = command.id ?? command.workspace;
            if (!await confirm(`Delete ${target}?`)) {
                return success(false);
            }
        }
        return success(dispatchCommand(command, writeInput));
    } catch (error) {
        return failure(error);
    }
}

function success(output: unknown): {
    exitCode: 0;
    output: unknown;
    stream: "stdout";
} {
    return { exitCode: 0, output, stream: "stdout" };
}

function failure(error: unknown): {
    exitCode: number;
    output: ErrorOutput;
    stream: "stderr";
} {
    if (error instanceof CLIInputError) {
        return {
            exitCode: 2,
            output: errorOutput(error.code, error.message, error.details),
            stream: "stderr",
        };
    }
    if (error instanceof CLIOperationError) {
        return {
            exitCode: 1,
            output: errorOutput(error.code, error.message, error.details),
            stream: "stderr",
        };
    }

    return {
        exitCode: 1,
        output: errorOutput(
            "INTERNAL_ERROR",
            error instanceof Error ? error.message : String(error),
        ),
        stream: "stderr",
    };
}

function errorOutput(code: string, message: string, details?: unknown): ErrorOutput {
    return {
        error: {
            code,
            message,
            ...(details === undefined ? {} : { details }),
        },
    };
}

async function main(): Promise<void> {
    const result = await runCLI(Bun.argv.slice(2));
    const output = `${JSON.stringify(result.output)}\n`;

    if (result.stream === "stdout") {
        await Bun.write(Bun.stdout, output);
    } else {
        await Bun.write(Bun.stderr, output);
    }
    process.exitCode = result.exitCode;
}

if (import.meta.main) {
    await main();
}

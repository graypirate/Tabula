export class CLIInputError extends Error {
    readonly code: string;
    readonly details?: unknown;

    constructor(code: string, message: string, details?: unknown) {
        super(message);
        this.name = "CLIInputError";
        this.code = code;
        this.details = details;
    }
}

export class CLIOperationError extends Error {
    readonly code: string;
    readonly details?: unknown;

    constructor(code: string, message: string, details?: unknown) {
        super(message);
        this.name = "CLIOperationError";
        this.code = code;
        this.details = details;
    }
}

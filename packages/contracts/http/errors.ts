export class ContractValidationError extends Error {
    readonly code?: string
    constructor(message: string, code?: string) {
        super(message);
        this.name = 'ContractValidationError';
        this.code = code;
    }
}
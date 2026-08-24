export class TransientProcessingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TransientProcessingError';
  }
}

export class PermanentMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentMessageError';
  }
}

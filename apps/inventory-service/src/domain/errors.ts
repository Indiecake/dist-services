export {
  PermanentMessageError,
  TransientProcessingError
} from '@services-sandbox/kafka/runtime';

export class InvalidInventoryCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInventoryCommandError';
  }
}

export class CatalogNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogNotFoundError';
  }
}

export class CatalogConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogConflictError';
  }
}

export class CatalogInvalidReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogInvalidReferenceError';
  }
}

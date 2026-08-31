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

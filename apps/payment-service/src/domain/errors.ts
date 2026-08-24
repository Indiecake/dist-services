export {
  PermanentMessageError,
  TransientProcessingError
} from '@services-sandbox/kafka/runtime';

export class InvalidPaymentCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPaymentCommandError';
  }
}

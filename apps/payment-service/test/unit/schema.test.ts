import {
  PAYMENT_SCHEMA_NAME,
  PAYMENT_TABLE_NAMES,
  paymentServiceTables
} from '../../src/db/schema';

describe('payment-service schema', () => {
  it('uses the owned postgres schema name', () => {
    expect(PAYMENT_SCHEMA_NAME).toBe('payments_schema');
  });

  it('defines payment, attempt, inbox, outbox, and dead-letter tables', () => {
    expect(PAYMENT_TABLE_NAMES).toEqual([
      'payments',
      'payment_attempts',
      'inbox_events',
      'outbox_events',
      'dead_letter_events'
    ]);
    expect(paymentServiceTables.payments).toBeDefined();
    expect(paymentServiceTables.paymentAttempts).toBeDefined();
    expect(paymentServiceTables.inboxEvents).toBeDefined();
    expect(paymentServiceTables.outboxEvents).toBeDefined();
    expect(paymentServiceTables.outboxEvents.claimedBy).toBeDefined();
    expect(paymentServiceTables.outboxEvents.leaseUntil).toBeDefined();
    expect(paymentServiceTables.deadLetterEvents).toBeDefined();
  });
});

# contracts

Shared message envelope types and helpers for Kafka commands and domain events.

## Exported helpers

- `createMessageEnvelope(input)`: build a validated envelope with generated `messageId` and `timestamp` defaults.
- `createCommandEnvelope(input)`: semantic wrapper for command messages.
- `createEventEnvelope(input)`: semantic wrapper for domain events.
- `createFollowUpEnvelope(parent, input)`: carry forward `correlationId`, set `causationId`, and reuse `traceparent` when a message is emitted because of another message.
- `validateMessageEnvelope(envelope)`: reject malformed contracts before producing or after consuming.

## Usage

```ts
import {
  createCommandEnvelope,
  createFollowUpEnvelope
} from './index.ts';

const command = createCommandEnvelope({
  type: 'payment.charge.requested',
  version: 1,
  source: 'saga-orchestrator',
  correlationId: 'corr-order-123',
  traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
  payload: {
    orderId: 'order-123',
    paymentId: 'payment-123',
    amountCents: 2599,
    currency: 'USD'
  }
});

const event = createFollowUpEnvelope(command, {
  type: 'payment.charged',
  version: 1,
  source: 'payment-service',
  payload: {
    orderId: 'order-123',
    paymentId: 'payment-123',
    providerReference: 'ch_123'
  }
});
```

See `/docs/kafka-topic-conventions.md` for the envelope contract, examples, and producer/consumer rules.

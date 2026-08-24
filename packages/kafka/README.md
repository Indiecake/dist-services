# kafka

Shared Kafka topic catalog and participant runtime for services that consume commands and publish result events through a transactional outbox.

## Topic catalog

Import from `@services-sandbox/kafka`:

- Command topics:
  - `dist.command.orders`
  - `dist.command.payments`
  - `dist.command.inventory`
  - `dist.command.shipping`
- Event topics:
  - `dist.event.orders`
  - `dist.event.payments`
  - `dist.event.inventory`
  - `dist.event.shipping`
  - `dist.event.saga`
- Dead-letter topics:
  - `dist.deadletter.orders`
  - `dist.deadletter.payments`
  - `dist.deadletter.inventory`
  - `dist.deadletter.shipping`

```ts
import {
  COMMAND_TOPICS,
  DEADLETTER_TOPICS,
  EVENT_TOPICS,
  getTopicPartitionKey
} from '@services-sandbox/kafka';

const paymentCommandTopic = COMMAND_TOPICS.payments;
const paymentDeadLetterTopic = DEADLETTER_TOPICS.payments;
const sagaEventTopic = EVENT_TOPICS.saga;

console.log(getTopicPartitionKey(sagaEventTopic));
```

## Participant schema

Import from `@services-sandbox/kafka/schema`. Compose the factories into the service-owned Drizzle `pgSchema`. Services still generate and apply their own migrations.

```ts
import { pgSchema } from 'drizzle-orm/pg-core';
import {
  createDeadLetterEventsTable,
  createInboxEventsTable,
  createOutboxEventsTable
} from '@services-sandbox/kafka/schema';

const inventorySchema = pgSchema('inventory_schema');
export const inboxEvents = createInboxEventsTable(inventorySchema);
export const outboxEvents = createOutboxEventsTable(inventorySchema);
export const deadLetterEvents = createDeadLetterEventsTable(inventorySchema);
```

`outbox_events` includes `claimed_by` and `lease_until` for competing pollers.

## Participant runtime

Import from `@services-sandbox/kafka/runtime`:

- `createInboxEventsTable` helpers used via `claimInboxEvent` inside the service business transaction
- `createOutboxStore` — lease claim, mark published, release on produce failure
- `drainClaimedOutbox` / `createKafkaParticipantRuntime` — consumer loop + outbox poller
- `handleCommandMessage` — envelope validate, bounded backoff, dispatch, dual DLQ callback
- `TransientProcessingError` / `PermanentMessageError`

```ts
import { COMMAND_TOPICS } from '@services-sandbox/kafka';
import {
  createKafkaParticipantRuntime,
  createOutboxStore,
  handleCommandMessage
} from '@services-sandbox/kafka/runtime';
```

The service owns domain dispatch (charge vs refund, reserve vs release). The package does not open the domain transaction.

`payment-service` is the first consumer of this runtime. DIST-17 inventory and DIST-18 shipping should use it instead of copying messaging code.

See `/docs/kafka-topic-conventions.md` and `/docs/adr/0002-use-outbox-pattern.md`.

# kafka

Shared Kafka topic definitions, naming helpers, and partition key metadata for services in this repository.

## Available topics

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

## Usage

```ts
import {
  COMMAND_TOPICS,
  DEADLETTER_TOPICS,
  EVENT_TOPICS,
  getTopicPartitionKey
} from './index.ts';

const paymentCommandTopic = COMMAND_TOPICS.payments;
const paymentDeadLetterTopic = DEADLETTER_TOPICS.payments;
const sagaEventTopic = EVENT_TOPICS.saga;

console.log(paymentCommandTopic);
console.log(paymentDeadLetterTopic);
console.log(getTopicPartitionKey(sagaEventTopic));
```

See `/docs/kafka-topic-conventions.md` for the naming and partitioning rationale.

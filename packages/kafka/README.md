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

## Usage

```ts
import {
  COMMAND_TOPICS,
  EVENT_TOPICS,
  getTopicPartitionKey
} from import './index.ts';

const paymentCommandTopic = COMMAND_TOPICS.payments;
const sagaEventTopic = EVENT_TOPICS.saga;

console.log(paymentCommandTopic);
console.log(getTopicPartitionKey(sagaEventTopic));
```

See `/docs/kafka-topic-conventions.md` for the naming and partitioning rationale.

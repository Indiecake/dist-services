const TOPIC_NAMESPACE = 'dist';
const TOPIC_KINDS = ['command', 'event'] as const;
const TOPIC_DOMAINS = ['orders', 'payments', 'inventory', 'shipping', 'saga'] as const;

type TopicKind = (typeof TOPIC_KINDS)[number];
type TopicDomain = (typeof TOPIC_DOMAINS)[number];
type TopicPartitionKey = 'orderId' | 'sagaId';

function buildTopicName(kind: TopicKind, domain: TopicDomain): string {
  if (!TOPIC_KINDS.includes(kind)) {
    throw new Error(`Unsupported topic kind: ${kind}`);
  }

  if (!TOPIC_DOMAINS.includes(domain)) {
    throw new Error(`Unsupported topic domain: ${domain}`);
  }

  return `${TOPIC_NAMESPACE}.${kind}.${domain}`;
}

const COMMAND_TOPICS = Object.freeze({
  orders: buildTopicName('command', 'orders'),
  payments: buildTopicName('command', 'payments'),
  inventory: buildTopicName('command', 'inventory'),
  shipping: buildTopicName('command', 'shipping')
});

const EVENT_TOPICS = Object.freeze({
  orders: buildTopicName('event', 'orders'),
  payments: buildTopicName('event', 'payments'),
  inventory: buildTopicName('event', 'inventory'),
  shipping: buildTopicName('event', 'shipping'),
  saga: buildTopicName('event', 'saga')
});

const TOPIC_PARTITION_KEYS = Object.freeze({
  [COMMAND_TOPICS.orders]: 'orderId',
  [COMMAND_TOPICS.payments]: 'orderId',
  [COMMAND_TOPICS.inventory]: 'orderId',
  [COMMAND_TOPICS.shipping]: 'orderId',
  [EVENT_TOPICS.orders]: 'orderId',
  [EVENT_TOPICS.payments]: 'orderId',
  [EVENT_TOPICS.inventory]: 'orderId',
  [EVENT_TOPICS.shipping]: 'orderId',
  [EVENT_TOPICS.saga]: 'sagaId'
} as Record<string, TopicPartitionKey>);

const TOPIC_CATALOG = Object.freeze({
  commands: COMMAND_TOPICS,
  events: EVENT_TOPICS
});

function getTopicPartitionKey(topicName: string): TopicPartitionKey {
  const partitionKey = TOPIC_PARTITION_KEYS[topicName];

  if (partitionKey === undefined) {
    throw new Error(`Unknown topic name: ${topicName}`);
  }

  return partitionKey;
}

export {
  TOPIC_NAMESPACE,
  TOPIC_KINDS,
  TOPIC_DOMAINS,
  COMMAND_TOPICS,
  EVENT_TOPICS,
  TOPIC_CATALOG,
  TOPIC_PARTITION_KEYS,
  buildTopicName,
  getTopicPartitionKey
};

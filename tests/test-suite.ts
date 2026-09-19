export type TestRunner = 'node-test' | 'jest';

export type TestSuite = {
  label: string;
  path: string;
  runner?: TestRunner;
  cwd?: string;
};

export const testSuites: readonly TestSuite[] = [
  { label: 'config package', path: 'packages/config/test/config.test.ts' },
  { label: 'contracts package', path: 'packages/contracts/test/event-envelope.test.ts' },
  {
    label: 'contracts order-service workflow catalog',
    path: 'packages/contracts/test/order-service-workflow.test.ts'
  },
  {
    label: 'contracts create-order validation',
    path: 'packages/contracts/test/create-order.test.ts'
  },
  {
    label: 'contracts catalog validation',
    path: 'packages/contracts/test/catalog.test.ts'
  },
  { label: 'kafka package', path: 'packages/kafka/test/topic-definitions.test.ts' },
  { label: 'kafka schema factories', path: 'packages/kafka/test/schema.test.ts' },
  { label: 'kafka backoff', path: 'packages/kafka/test/backoff.test.ts' },
  { label: 'kafka command handler', path: 'packages/kafka/test/command-handler.test.ts' },
  { label: 'kafka outbox drain', path: 'packages/kafka/test/kafka-runtime.test.ts' },
  { label: 'telemetry package', path: 'packages/telemetry/test/telemetry.test.ts' },
  { label: 'platform foundation checks', path: 'tests/checks/platform-foundation.test.ts' },
  { label: 'database layout checks', path: 'tests/checks/database-layout.test.ts' },
  {
    label: 'order-service unit tests',
    path: 'apps/order-service/test/unit/schema.test.ts',
    runner: 'jest',
    cwd: 'apps/order-service'
  },
  {
    label: 'order-service create-order unit tests',
    path: 'apps/order-service/test/unit/create-order.test.ts',
    runner: 'jest',
    cwd: 'apps/order-service'
  },
  {
    label: 'order-service integration tests',
    path: 'apps/order-service/test/integration/health.test.ts'
  },
  {
    label: 'order-service orders integration tests',
    path: 'apps/order-service/test/integration/orders.test.ts'
  },
  {
    label: 'order-service gateway e2e integration tests',
    path: 'apps/order-service/test/integration/gateway-e2e.test.ts'
  },
  {
    label: 'api-gateway unit tests',
    path: 'apps/api-gateway/test/unit/gateway.test.ts',
    runner: 'jest',
    cwd: 'apps/api-gateway'
  },
  {
    label: 'api-gateway integration tests',
    path: 'apps/api-gateway/test/integration/orders.test.ts'
  },
  {
    label: 'api-gateway catalog integration tests',
    path: 'apps/api-gateway/test/integration/catalog.test.ts'
  },
  {
    label: 'payment-service unit tests',
    path: 'apps/payment-service/test/unit/schema.test.ts',
    runner: 'jest',
    cwd: 'apps/payment-service'
  },
  {
    label: 'payment-service integration tests',
    path: 'apps/payment-service/test/integration/health.test.ts'
  },
  {
    label: 'payment-service payments integration tests',
    path: 'apps/payment-service/test/integration/payments.test.ts'
  },
  {
    label: 'payment-service kafka integration tests',
    path: 'apps/payment-service/test/integration/kafka.test.ts'
  },
  {
    label: 'payment-service outbox integration tests',
    path: 'apps/payment-service/test/integration/outbox.test.ts'
  },
  {
    label: 'inventory-service unit tests',
    path: 'apps/inventory-service/test/unit/schema.test.ts',
    runner: 'jest',
    cwd: 'apps/inventory-service'
  },
  {
    label: 'inventory-service integration tests',
    path: 'apps/inventory-service/test/integration/health.test.ts'
  },
  {
    label: 'inventory-service inventory integration tests',
    path: 'apps/inventory-service/test/integration/inventory.test.ts'
  },
  {
    label: 'inventory-service kafka integration tests',
    path: 'apps/inventory-service/test/integration/kafka.test.ts'
  },
  {
    label: 'inventory-service outbox integration tests',
    path: 'apps/inventory-service/test/integration/outbox.test.ts'
  },
  {
    label: 'inventory-service seed integration tests',
    path: 'apps/inventory-service/test/integration/seed.test.ts'
  },
  {
    label: 'inventory-service catalog integration tests',
    path: 'apps/inventory-service/test/integration/catalog.test.ts'
  },
  { label: 'test suite registry', path: 'tests/run-all.test.ts' }
];

export const testFiles = testSuites.map((suite) => suite.path);

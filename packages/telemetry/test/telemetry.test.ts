import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createLogger,
  createRequestContext,
  shouldLogHttpRequest
} from '../index.ts';

test('creates request context from headers and traceparent', () => {
  const context = createRequestContext({
    'x-request-id': 'req-001',
    'x-correlation-id': 'corr-001',
    traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
  });

  assert.equal(context.requestId, 'req-001');
  assert.equal(context.correlationId, 'corr-001');
  assert.equal(context.traceId, '4bf92f3577b34da6a3ce929d0e0e4736');
});

test('falls back to request id when correlation id is missing', () => {
  const context = createRequestContext({
    requestId: 'req-002'
  });

  assert.equal(context.requestId, 'req-002');
  assert.equal(context.correlationId, 'req-002');
  assert.equal(typeof context.traceId, 'object');
  assert.equal(context.traceId, null);
});

test('logger emits structured JSON with service and request context', () => {
  const lines = [];
  const logger = createLogger({
    serviceName: 'inventory-service',
    write: (line) => lines.push(line)
  });

  const entry = logger.info('Reservation created.', {
    correlationId: 'corr-003',
    requestId: 'req-003',
    traceId: 'trace-003',
    orderId: 'ord-003'
  });

  assert.equal(lines.length, 1);
  assert.equal(entry.serviceName, 'inventory-service');
  assert.equal(entry.correlationId, 'corr-003');
  assert.equal(entry.requestId, 'req-003');
  assert.equal(entry.traceId, 'trace-003');
  assert.equal(entry.orderId, 'ord-003');

  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.message, 'Reservation created.');
  assert.equal(parsed.level, 'info');
});

test('child loggers carry shared context forward', () => {
  const lines = [];
  const logger = createLogger({
    serviceName: 'shipping-service',
    write: (line) => lines.push(line)
  }).child({ correlationId: 'corr-004' });

  const entry = logger.warn('Shipping delayed.', { shipmentId: 'ship-004' });

  assert.equal(entry.correlationId, 'corr-004');
  assert.equal(entry.shipmentId, 'ship-004');
  assert.equal(lines.length, 1);
});

test('health checks are quiet unless they fail', () => {
  assert.equal(
    shouldLogHttpRequest({ method: 'GET', path: '/health', statusCode: 200 }),
    false
  );
  assert.equal(
    shouldLogHttpRequest({ method: 'HEAD', path: '/ready', statusCode: 200 }),
    false
  );
  assert.equal(
    shouldLogHttpRequest({ method: 'GET', path: '/health', statusCode: 503 }),
    true
  );
  assert.equal(
    shouldLogHttpRequest({ method: 'POST', path: '/health', statusCode: 200 }),
    true
  );
});

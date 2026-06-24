import test from 'node:test';
import assert from 'node:assert/strict';

import { ConfigValidationError, loadServiceConfig } from '../index.ts';

function createEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    SERVICE_NAME: 'order-service',
    PORT: '3001',
    DATABASE_URL: 'postgres://platform:platform@localhost:5432/platform',
    KAFKA_BOOTSTRAP_SERVERS: 'localhost:9092,kafka:9092',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
    LOG_LEVEL: 'info',
    ...overrides
  };
}

test('loads service configuration from environment variables', () => {
  const config = loadServiceConfig(createEnv());

  assert.equal(config.serviceName, 'order-service');
  assert.equal(config.port, 3001);
  assert.equal(config.databaseUrl, 'postgres://platform:platform@localhost:5432/platform');
  assert.deepEqual(config.kafkaBootstrapServers, ['localhost:9092', 'kafka:9092']);
  assert.equal(config.otelExporterOtlpEndpoint, 'http://localhost:4318');
  assert.equal(config.logLevel, 'info');
});

test('normalizes log level and trims bootstrap server values', () => {
  const config = loadServiceConfig(
    createEnv({
      KAFKA_BOOTSTRAP_SERVERS: ' localhost:9092 , kafka:9092 ',
      LOG_LEVEL: 'WARN'
    })
  );

  assert.deepEqual(config.kafkaBootstrapServers, ['localhost:9092', 'kafka:9092']);
  assert.equal(config.logLevel, 'warn');
});

test('throws a validation error for missing required variables', () => {
  assert.throws(
    () =>
      loadServiceConfig(
        createEnv({
          SERVICE_NAME: '',
          PORT: '',
          DATABASE_URL: '',
          KAFKA_BOOTSTRAP_SERVERS: '',
          OTEL_EXPORTER_OTLP_ENDPOINT: '',
          LOG_LEVEL: ''
        })
      ),
    (error) => {
      assert.ok(error instanceof ConfigValidationError);
      assert.match(error.message, /SERVICE_NAME is required/);
      assert.match(error.message, /PORT is required/);
      assert.match(error.message, /DATABASE_URL is required/);
      return true;
    }
  );
});

test('throws a validation error for malformed values', () => {
  assert.throws(
    () =>
      loadServiceConfig(
        createEnv({
          PORT: '0',
          DATABASE_URL: 'not-a-url',
          OTEL_EXPORTER_OTLP_ENDPOINT: 'invalid',
          LOG_LEVEL: 'verbose'
        })
      ),
    (error) => {
      assert.ok(error instanceof ConfigValidationError);
      assert.match(error.message, /PORT must be an integer between 1 and 65535/);
      assert.match(error.message, /DATABASE_URL must be a valid URL/);
      assert.match(error.message, /OTEL_EXPORTER_OTLP_ENDPOINT must be a valid URL/);
      assert.match(error.message, /LOG_LEVEL must be one of/);
      return true;
    }
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';

import pg from 'pg';

import { createPaymentService } from '../../src/server.ts';

async function isPostgresAvailable(databaseUrl: string): Promise<boolean> {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2_000
  });

  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

test('GET /health returns ok when service boots against Postgres', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping payment-service integration test.');
    return;
  }

  process.env.SERVICE_NAME = 'payment-service';
  process.env.PORT = '3002';
  process.env.DATABASE_URL = databaseUrl;
  process.env.KAFKA_BOOTSTRAP_SERVERS = 'localhost:9092';
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
  process.env.LOG_LEVEL = 'info';

  const runtime = await createPaymentService({ enableMessaging: false });

  try {
    const response = await runtime.app.inject({
      method: 'GET',
      url: '/health'
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      status: 'ok',
      service: 'payment-service'
    });
  } finally {
    await runtime.close();
  }
});

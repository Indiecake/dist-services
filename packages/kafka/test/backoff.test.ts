import test from 'node:test';
import assert from 'node:assert/strict';

import { TransientProcessingError } from '../errors.ts';
import { withBoundedBackoff } from '../backoff.ts';

test('returns on the first success', async () => {
  const result = await withBoundedBackoff(
    async () => 'ok',
    [5, 5],
    (error) => error instanceof TransientProcessingError
  );

  assert.equal(result, 'ok');
});

test('retries retryable errors then succeeds', async () => {
  let calls = 0;

  const result = await withBoundedBackoff(
    async () => {
      calls += 1;
      if (calls < 3) {
        throw new TransientProcessingError('blip');
      }
      return 'recovered';
    },
    [0, 0],
    (error) => error instanceof TransientProcessingError
  );

  assert.equal(result, 'recovered');
  assert.equal(calls, 3);
});

test('does not retry permanent errors', async () => {
  let calls = 0;

  await assert.rejects(
    withBoundedBackoff(
      async () => {
        calls += 1;
        throw new Error('poison');
      },
      [0, 0],
      (error) => error instanceof TransientProcessingError
    ),
    /poison/
  );

  assert.equal(calls, 1);
});

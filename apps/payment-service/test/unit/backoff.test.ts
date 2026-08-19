import { TransientProcessingError } from '../../src/domain/errors.ts';
import { withBoundedBackoff } from '../../src/messaging/backoff.ts';

describe('withBoundedBackoff', () => {
  it('returns on the first success', async () => {
    const result = await withBoundedBackoff(
      async () => 'ok',
      [5, 5],
      (error) => error instanceof TransientProcessingError
    );

    expect(result).toBe('ok');
  });

  it('retries retryable errors then succeeds', async () => {
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

    expect(result).toBe('recovered');
    expect(calls).toBe(3);
  });

  it('does not retry permanent errors', async () => {
    let calls = 0;

    await expect(
      withBoundedBackoff(
        async () => {
          calls += 1;
          throw new Error('poison');
        },
        [0, 0],
        (error) => error instanceof TransientProcessingError
      )
    ).rejects.toThrow('poison');

    expect(calls).toBe(1);
  });
});

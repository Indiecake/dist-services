export const DEFAULT_RETRY_DELAYS_MS = [200, 800] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withBoundedBackoff<T>(
  operation: () => Promise<T>,
  delaysMs: readonly number[] = DEFAULT_RETRY_DELAYS_MS,
  isRetryable: (error: unknown) => boolean
): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryable(error) || attempt >= delaysMs.length) {
        throw error;
      }

      await sleep(delaysMs[attempt] ?? 0);
      attempt += 1;
    }
  }
}

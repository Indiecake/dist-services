import { DEFAULT_RETRY_DELAYS_MS, withBoundedBackoff } from '@services-sandbox/kafka/runtime';
import { TransientProcessingError } from './errors.ts';

export async function commitAfterProcessor<TProcessorResult, TCommitResult>(input: {
  needsProcessor: boolean;
  runProcessor: () => Promise<TProcessorResult>;
  commit: (processorResult: TProcessorResult | null) => Promise<TCommitResult>;
  retryDelaysMs?: readonly number[];
}): Promise<TCommitResult> {
  const processorResult = input.needsProcessor ? await input.runProcessor() : null;

  return withBoundedBackoff(
    () => input.commit(processorResult),
    input.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS,
    (error) => error instanceof TransientProcessingError
  );
}

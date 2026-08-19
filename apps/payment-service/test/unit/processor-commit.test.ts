import { TransientProcessingError } from '../../src/domain/errors.ts';
import { commitAfterProcessor } from '../../src/domain/processor-commit.ts';

describe('commitAfterProcessor', () => {
  it('does not call the processor when the plan skips it', async () => {
    let processorCalls = 0;
    let commitCalls = 0;

    const result = await commitAfterProcessor({
      needsProcessor: false,
      runProcessor: async () => {
        processorCalls += 1;
        return 'charged';
      },
      commit: async (processorResult) => {
        commitCalls += 1;
        return processorResult;
      }
    });

    expect(result).toBeNull();
    expect(processorCalls).toBe(0);
    expect(commitCalls).toBe(1);
  });

  it('retries commit without calling the processor again', async () => {
    let processorCalls = 0;
    let commitCalls = 0;

    const result = await commitAfterProcessor({
      needsProcessor: true,
      retryDelaysMs: [0, 0],
      runProcessor: async () => {
        processorCalls += 1;
        return 'charged';
      },
      commit: async (processorResult) => {
        commitCalls += 1;
        if (commitCalls < 3) {
          throw new TransientProcessingError('outbox write failed');
        }
        return processorResult;
      }
    });

    expect(result).toBe('charged');
    expect(processorCalls).toBe(1);
    expect(commitCalls).toBe(3);
  });
});

export type TestSuite = {
  label: string;
  path: string;
};

export const testSuites: readonly TestSuite[] = [
  { label: 'config package', path: 'packages/config/test/config.test.ts' },
  { label: 'contracts package', path: 'packages/contracts/test/event-envelope.test.ts' },
  { label: 'kafka package', path: 'packages/kafka/test/topic-definitions.test.ts' },
  { label: 'telemetry package', path: 'packages/telemetry/test/telemetry.test.ts' },
  { label: 'platform foundation checks', path: 'tests/checks/platform-foundation.test.ts' },
  { label: 'database layout checks', path: 'tests/checks/database-layout.test.ts' },
  { label: 'test suite registry', path: 'tests/run-all.test.ts' }
];

export const testFiles = testSuites.map((suite) => suite.path);

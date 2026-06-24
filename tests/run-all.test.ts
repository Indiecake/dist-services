import { existsSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { repoRoot } from './repo-root.ts';
import { testFiles, testSuites } from './test-suite.ts';

test('registers package unit tests and repository checks', () => {
  assert.ok(testSuites.some((suite) => suite.path.includes('packages/config/test/')));
  assert.ok(testSuites.some((suite) => suite.path.includes('tests/checks/platform-foundation.test.ts')));
  assert.ok(testSuites.some((suite) => suite.path.includes('tests/checks/database-layout.test.ts')));
});

test('defines a readable label for every registered suite', () => {
  for (const suite of testSuites) {
    assert.ok(suite.label.trim().length > 0, `Missing label for ${suite.path}`);
  }
});

test('points every registered test file at an existing path', () => {
  for (const relativePath of testFiles) {
    assert.ok(
      existsSync(path.join(repoRoot, relativePath)),
      `Missing registered test file: ${relativePath}`
    );
  }
});

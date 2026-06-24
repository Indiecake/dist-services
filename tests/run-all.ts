import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { repoRoot } from './repo-root.ts';
import { testSuites } from './test-suite.ts';

function logSuiteHeader(label: string, relativePath: string): void {
  const divider = '='.repeat(72);
  console.log(`\n${divider}`);
  console.log(`SUITE: ${label}`);
  console.log(`FILE:  ${relativePath}`);
  console.log(divider);
}

let failedSuites = 0;

for (const suite of testSuites) {
  logSuiteHeader(suite.label, suite.path);

  const target = path.join(repoRoot, suite.path);
  const result = spawnSync(process.execPath, ['--test', target], {
    cwd: repoRoot,
    stdio: 'inherit'
  });

  if (result.error) {
    console.error(`Failed to run ${suite.path}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    failedSuites += 1;
  }
}

console.log('');

if (failedSuites > 0) {
  console.error(`${failedSuites} of ${testSuites.length} suites failed.`);
  process.exit(1);
}

console.log(`All ${testSuites.length} suites passed.`);

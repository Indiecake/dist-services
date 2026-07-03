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

function runNodeTestSuite(relativePath: string): number | null {
  const target = path.join(repoRoot, relativePath);
  const result = spawnSync(process.execPath, ['--test', target], {
    cwd: repoRoot,
    stdio: 'inherit'
  });

  if (result.error) {
    console.error(`Failed to run ${relativePath}: ${result.error.message}`);
    process.exit(1);
  }

  return result.status;
}

function runJestSuite(relativeCwd: string): number | null {
  const cwd = path.join(repoRoot, relativeCwd);
  const jestBin = path.join(cwd, 'node_modules/jest/bin/jest.js');
  const result = spawnSync(
    process.execPath,
    ['--experimental-vm-modules', jestBin, '--config', 'jest.config.ts'],
    {
      cwd,
      stdio: 'inherit'
    }
  );

  if (result.error) {
    console.error(`Failed to run Jest in ${relativeCwd}: ${result.error.message}`);
    process.exit(1);
  }

  return result.status;
}

let failedSuites = 0;

for (const suite of testSuites) {
  logSuiteHeader(suite.label, suite.path);

  const status =
    suite.runner === 'jest'
      ? runJestSuite(suite.cwd ?? path.dirname(suite.path))
      : runNodeTestSuite(suite.path);

  if (status !== 0) {
    failedSuites += 1;
  }
}

console.log('');

if (failedSuites > 0) {
  console.error(`${failedSuites} of ${testSuites.length} suites failed.`);
  process.exit(1);
}

console.log(`All ${testSuites.length} suites passed.`);

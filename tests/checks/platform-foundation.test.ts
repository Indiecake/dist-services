import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

import { repoRoot } from '../repo-root.ts';

const requiredServices = [
  'postgres',
  'kafka',
  'kafka-ui',
  'otel-collector',
  'jaeger',
  'prometheus',
  'grafana'
] as const;

const requiredFiles = [
  '.env.example',
  'Makefile',
  'infra/otel/otel-collector-config.yaml',
  'infra/prometheus/prometheus.yml',
  'infra/grafana/provisioning/datasources/datasources.yaml',
  'infra/grafana/provisioning/dashboards/dashboards.yaml',
  'docs/local-development.md'
] as const;

test('defines required compose services', () => {
  const result = spawnSync('docker', ['compose', 'config'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  assert.equal(
    result.status,
    0,
    result.stderr?.trim() || 'docker compose config failed'
  );

  for (const service of requiredServices) {
    assert.match(
      result.stdout,
      new RegExp(`^  ${service}:`, 'm'),
      `Missing required compose service: ${service}`
    );
  }
});

test('includes required platform files', () => {
  for (const file of requiredFiles) {
    assert.ok(
      existsSync(path.join(repoRoot, file)),
      `Missing required platform file: ${file}`
    );
  }
});

test('documents local startup commands and tooling URLs', () => {
  const localDevelopment = readFileSync(
    path.join(repoRoot, 'docs/local-development.md'),
    'utf8'
  );
  const composeFile = readFileSync(path.join(repoRoot, 'docker-compose.yml'), 'utf8');

  assert.match(localDevelopment, /make up/);
  assert.match(localDevelopment, /http:\/\/localhost:3000/);
  assert.match(composeFile, /GF_SECURITY_ADMIN_USER/);
});

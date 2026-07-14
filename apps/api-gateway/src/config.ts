import { ConfigValidationError, loadEdgeServiceConfig } from '@services-sandbox/config';
import type { EdgeServiceConfig } from '@services-sandbox/config';

export interface GatewayConfig extends EdgeServiceConfig {
  orderServiceBaseUrl: string;
  orderServiceTimeoutMs: number;
}

type ServiceEnvironment = NodeJS.ProcessEnv | Record<string, string | undefined>;

function readUrl(
  env: ServiceEnvironment,
  name: string,
  issues: string[]
): string | null {
  const value = env[name];

  if (typeof value !== 'string' || value.trim() === '') {
    issues.push(`${name} is required.`);
    return null;
  }

  try {
    new URL(value.trim());
    return value.trim();
  } catch {
    issues.push(`${name} must be a valid URL.`);
    return null;
  }
}

function readOptionalPositiveInt(
  env: ServiceEnvironment,
  name: string,
  defaultValue: number,
  issues: string[]
): number {
  const value = env[name];

  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    issues.push(`${name} must be a positive integer.`);
    return defaultValue;
  }

  return parsed;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

export function loadGatewayConfig(env: ServiceEnvironment = process.env): GatewayConfig {
  const edge = loadEdgeServiceConfig(env);
  const issues: string[] = [];

  const orderServiceBaseUrl = readUrl(env, 'ORDER_SERVICE_BASE_URL', issues);
  const orderServiceTimeoutMs = readOptionalPositiveInt(
    env,
    'ORDER_SERVICE_TIMEOUT_MS',
    5000,
    issues
  );

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }

  return {
    ...edge,
    orderServiceBaseUrl: normalizeBaseUrl(orderServiceBaseUrl as string),
    orderServiceTimeoutMs
  };
}

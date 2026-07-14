import { VALID_LOG_LEVELS } from '../telemetry/log-levels.ts';

type ServiceEnvironment = NodeJS.ProcessEnv | Record<string, string | undefined>;
type ValidationIssues = string[];
type ValidLogLevel = (typeof VALID_LOG_LEVELS)[number];

interface ServiceConfig {
  serviceName: string;
  port: number;
  databaseUrl: string;
  kafkaBootstrapServers: string[];
  otelExporterOtlpEndpoint: string;
  logLevel: ValidLogLevel;
}

interface EdgeServiceConfig {
  serviceName: string;
  port: number;
  kafkaBootstrapServers: string[];
  otelExporterOtlpEndpoint: string;
  logLevel: ValidLogLevel;
}

class ConfigValidationError extends Error {
  issues: string[];

  constructor(issues: string[]) {
    super(`Invalid service configuration:\n- ${issues.join('\n- ')}`);
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

function readRequiredString(
  env: ServiceEnvironment,
  name: string,
  issues: ValidationIssues
): string | null {
  const value = env[name];

  if (typeof value !== 'string' || value.trim() === '') {
    issues.push(`${name} is required.`);
    return null;
  }

  return value.trim();
}

function readPort(env: ServiceEnvironment, name: string, issues: ValidationIssues): number | null {
  const value = readRequiredString(env, name, issues);

  if (value === null) {
    return null;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    issues.push(`${name} must be an integer between 1 and 65535.`);
    return null;
  }

  return port;
}

function readKafkaBootstrapServers(
  env: ServiceEnvironment,
  name: string,
  issues: ValidationIssues
): string[] {
  const value = readRequiredString(env, name, issues);

  if (value === null) {
    return [];
  }

  const servers = value
    .split(',')
    .map((server: string) => server.trim())
    .filter(Boolean);

  if (servers.length === 0) {
    issues.push(`${name} must contain at least one bootstrap server.`);
  }

  return servers;
}

function readUrl(env: ServiceEnvironment, name: string, issues: ValidationIssues): string | null {
  const value = readRequiredString(env, name, issues);

  if (value === null) {
    return null;
  }

  try {
    // Validate shape while preserving the original string for downstream clients.
    new URL(value);
    return value;
  } catch {
    issues.push(`${name} must be a valid URL.`);
    return null;
  }
}

function readLogLevel(
  env: ServiceEnvironment,
  name: string,
  issues: ValidationIssues
): ValidLogLevel | null {
  const value = readRequiredString(env, name, issues);

  if (value === null) {
    return null;
  }

  const normalized = value.toLowerCase();

  if (!VALID_LOG_LEVELS.includes(normalized)) {
    issues.push(`${name} must be one of: ${VALID_LOG_LEVELS.join(', ')}.`);
    return null;
  }

  return normalized as ValidLogLevel;
}

function loadEdgeServiceConfig(env: ServiceEnvironment = process.env): EdgeServiceConfig {
  const issues: ValidationIssues = [];

  const serviceName = readRequiredString(env, 'SERVICE_NAME', issues);
  const port = readPort(env, 'PORT', issues);
  const kafkaBootstrapServers = readKafkaBootstrapServers(env, 'KAFKA_BOOTSTRAP_SERVERS', issues);
  const otelExporterOtlpEndpoint = readUrl(env, 'OTEL_EXPORTER_OTLP_ENDPOINT', issues);
  const logLevel = readLogLevel(env, 'LOG_LEVEL', issues);

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }

  return {
    serviceName: serviceName as string,
    port: port as number,
    kafkaBootstrapServers,
    otelExporterOtlpEndpoint: otelExporterOtlpEndpoint as string,
    logLevel: logLevel as ValidLogLevel
  };
}

function loadServiceConfig(env: ServiceEnvironment = process.env): ServiceConfig {
  const issues: ValidationIssues = [];

  const serviceName = readRequiredString(env, 'SERVICE_NAME', issues);
  const port = readPort(env, 'PORT', issues);
  const databaseUrl = readUrl(env, 'DATABASE_URL', issues);
  const kafkaBootstrapServers = readKafkaBootstrapServers(env, 'KAFKA_BOOTSTRAP_SERVERS', issues);
  const otelExporterOtlpEndpoint = readUrl(env, 'OTEL_EXPORTER_OTLP_ENDPOINT', issues);
  const logLevel = readLogLevel(env, 'LOG_LEVEL', issues);

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }

  return {
    serviceName: serviceName as string,
    port: port as number,
    databaseUrl: databaseUrl as string,
    kafkaBootstrapServers,
    otelExporterOtlpEndpoint: otelExporterOtlpEndpoint as string,
    logLevel: logLevel as ValidLogLevel
  };
}

export {
  ConfigValidationError,
  VALID_LOG_LEVELS,
  loadEdgeServiceConfig,
  loadServiceConfig
};

export type { EdgeServiceConfig, ServiceConfig };

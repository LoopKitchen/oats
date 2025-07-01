/**
 * OATSJS - OpenAPI TypeScript Sync
 *
 * Main entry point for programmatic usage of OATS.
 * This module exports all public APIs for both CLI and programmatic usage.
 *
 * @module oatsjs
 * @license MIT
 */

// Core exports
export { DevSyncOrchestrator } from './core/orchestrator.js';
export { DevSyncEngine } from './core/dev-sync-optimized.js';
export { SwaggerChangeDetector } from './core/swagger-diff.js';

// CLI exports for programmatic usage
export { init } from './cli/init.js';
export { start } from './cli/start.js';
export { detect } from './cli/detect.js';
export { validate } from './cli/validate.js';

// Type exports
export type {
  OatsConfig,
  ServicesConfig,
  BackendServiceConfig,
  ClientServiceConfig,
  FrontendServiceConfig,
  SyncConfig,
  LogConfig,
  ApiSpecConfig,
  GeneratorConfig,
  ConfigValidationResult,
  ConfigValidationWarning,
  RuntimeConfig,
  ApiSpecFormat,
  GeneratorType,
  ServiceType,
  SyncStrategy,
} from './types/config.types.js';

// Error exports
export {
  OatsError,
  ConfigError,
  ConfigValidationError,
  ServiceError,
  ServiceStartError,
  FileSystemError,
  ApiSpecError,
  GeneratorError,
  NetworkError,
  DependencyError,
  CommandError,
  TimeoutError,
  UserCancelledError,
  ErrorWithSuggestion,
  ErrorHandler,
} from './errors/index.js';

// Schema exports
export {
  configSchema,
  validateConfig,
  mergeWithDefaults,
} from './config/schema.js';

// Config definition helper
export { defineConfig } from './config.js';

// Version export
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
);

export const VERSION: string = packageJson.version as string;

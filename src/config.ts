/**
 * OATS Configuration TypeScript Support
 *
 * This module provides TypeScript support for OATS configuration files.
 * Users can create oats.config.ts files and import this for full type safety.
 *
 * @example
 * ```typescript
 * import { defineConfig } from '@tryloop/oats';
 *
 * export default defineConfig({
 *   services: {
 *     backend: {
 *       path: '../backend',
 *       startCommand: 'npm run dev',
 *       port: 4000,
 *       apiSpec: {
 *         path: 'swagger.json'
 *       }
 *     },
 *     client: {
 *       path: '../client',
 *       packageName: '@mycompany/api-client'
 *     }
 *   }
 * });
 * ```
 */

import type { OatsConfig } from './types/config.types.js';

/**
 * Define an OATS configuration with full TypeScript support
 *
 * @param config - OATS configuration object
 * @returns The same configuration object with type checking
 */
export function defineConfig(config: OatsConfig): OatsConfig {
  return config;
}

// Re-export types for convenience
export type {
  OatsConfig,
  ServicesConfig,
  BackendServiceConfig,
  ClientServiceConfig,
  FrontendServiceConfig,
  ApiSpecConfig,
  SyncConfig,
  LogConfig,
  GeneratorType,
  SyncStrategy,
} from './types/config.types.js';

/**
 * OATSJS Configuration Type Definitions
 *
 * This module defines the complete type system for OATS configuration,
 * ensuring type safety and IDE support for all configuration options.
 *
 * @module @oatsjs/types/config
 * @author OATS Contributors
 * @license MIT
 */

/**
 * Supported OpenAPI specification formats
 */
export type ApiSpecFormat = 'openapi3' | 'openapi2' | 'swagger2' | 'swagger1';

/**
 * Supported TypeScript client generators
 */
export type GeneratorType =
  | 'custom'
  | '@hey-api/openapi-ts'
  | 'swagger-typescript-api'
  | 'openapi-generator-cli';

/**
 * Service types for identification and validation
 */
export type ServiceType = 'backend' | 'client' | 'frontend';

/**
 * Sync strategies for change detection
 */
export type SyncStrategy = 'smart' | 'aggressive' | 'conservative';

/**
 * OpenAPI specification configuration
 */
export interface ApiSpecConfig {
  /**
   * Path to the OpenAPI/Swagger specification file
   * Relative to the backend service root
   * @example "src/swagger.json", "docs/openapi.yaml"
   */
  path: string;

  /**
   * Format of the API specification
   * @default "openapi3"
   */
  format?: ApiSpecFormat;

  /**
   * Additional paths to watch for changes
   * Useful when spec is generated from source files
   * @example ["src/controllers/*.ts"]
   */
  watch?: string[];
}

/**
 * Base configuration shared by all services
 */
export interface BaseServiceConfig {
  /**
   * Path to the service directory
   * Can be relative or absolute
   * @example "../backend", "/home/user/projects/api"
   */
  path: string;

  /**
   * Service type identifier
   * Used for validation and service-specific logic
   */
  type?: ServiceType;
}

/**
 * Supported runtime environments
 */
export type RuntimeType = 'node' | 'python';

/**
 * Backend service configuration
 */
export interface BackendServiceConfig extends BaseServiceConfig {
  /**
   * Port number for the backend development server
   * @default 4000 for Node.js, 8000 for Python
   */
  port?: number;

  /**
   * Command to start the backend service
   * @example "npm run dev", "yarn dev", "uvicorn main:app --reload"
   */
  startCommand: string;

  /**
   * Pattern to detect when the backend is ready
   * Used to determine when to start watching for changes
   * @default "Server listening on" for Node.js, "Uvicorn running on" for Python
   */
  readyPattern?: string;

  /**
   * Runtime environment for the backend
   * @default "node"
   */
  runtime?: RuntimeType;

  /**
   * Python-specific configuration
   */
  python?: {
    /**
     * Virtual environment directory name
     * @example "venv", ".venv", "env"
     */
    virtualEnv?: string;

    /**
     * Python package manager
     * @default "pip"
     */
    packageManager?: 'pip' | 'poetry' | 'pipenv';

    /**
     * Python executable path (if custom)
     * @default "python" or "python3"
     */
    executable?: string;
  };

  /**
   * API specification configuration
   */
  apiSpec: ApiSpecConfig;

  /**
   * Environment variables to set when starting the service
   */
  env?: Record<string, string>;

  /**
   * Working directory for the start command
   * @default The service path
   */
  cwd?: string;
}

/**
 * Client generator configuration options
 */
export interface GeneratorConfig {
  /**
   * Input file path (relative to client directory)
   * @default "./swagger.json"
   */
  input?: string;

  /**
   * Output directory for generated code
   * @default "./src"
   */
  output?: string;

  /**
   * HTTP client library to use
   * @default "axios"
   */
  client?: 'axios' | 'fetch' | 'xhr' | 'node';

  /**
   * Whether to export core utilities
   * @default true
   */
  exportCore?: boolean;

  /**
   * Whether to export service classes
   * @default true
   */
  exportServices?: boolean;

  /**
   * Whether to export models/types
   * @default true
   */
  exportModels?: boolean;

  /**
   * Additional generator-specific options
   */
  [key: string]: unknown;
}

/**
 * TypeScript client service configuration
 */
export interface ClientServiceConfig extends BaseServiceConfig {
  /**
   * NPM package name of the client
   * Used for linking and importing
   * @example "@myorg/api-client"
   */
  packageName: string;

  /**
   * Generator type or custom identifier
   * @default "custom"
   */
  generator: GeneratorType;

  /**
   * Command to generate the TypeScript client
   * Required when generator is "custom"
   * @example "npm run generate", "yarn openapi-ts"
   */
  generateCommand?: string;

  /**
   * Command to build the client package
   * @example "npm run build", "yarn build"
   */
  buildCommand?: string;

  /**
   * Command to link the package for local development
   * @default "npm link" or "yarn link"
   */
  linkCommand?: string;

  /**
   * Generator-specific configuration
   * Used when generator is not "custom"
   */
  generatorConfig?: GeneratorConfig;

  /**
   * Command to run after generation
   * Useful for formatting or linting
   * @example "npm run format"
   */
  postGenerate?: string;

  /**
   * Whether to automatically install dependencies after generation
   * @default false
   */
  autoInstall?: boolean;

  /**
   * Environment variables to set when running the service
   */
  env?: Record<string, string>;
}

/**
 * Frontend service configuration
 */
export interface FrontendServiceConfig extends BaseServiceConfig {
  /**
   * Port number for the frontend development server
   * Required to avoid conflicts - must match your dev server's actual port
   * @example 3000 for React, 5173 for Vite, 4200 for Angular
   */
  port: number;

  /**
   * Command to start the frontend service
   * Required to support different frameworks
   * @example "npm start", "yarn dev", "ng serve", "pnpm dev"
   */
  startCommand: string;

  /**
   * Command to link packages in the frontend
   * @default "npm link" or "yarn link"
   */
  packageLinkCommand?: string;

  /**
   * Frontend framework (for future framework-specific features)
   * @default "auto-detect"
   */
  framework?:
    | 'react'
    | 'vue'
    | 'angular'
    | 'svelte'
    | 'next'
    | 'nuxt'
    | 'auto-detect';

  /**
   * Pattern to detect when the frontend is ready
   * @default "compiled successfully"
   */
  readyPattern?: string;

  /**
   * Environment variables to set when starting the service
   */
  env?: Record<string, string>;
}

/**
 * Services configuration section
 */
export interface ServicesConfig {
  /**
   * Backend service configuration
   */
  backend: BackendServiceConfig;

  /**
   * TypeScript client configuration
   */
  client: ClientServiceConfig;

  /**
   * Frontend service configuration (optional)
   * If not provided, OATS will not start a frontend service
   */
  frontend?: FrontendServiceConfig;
}

/**
 * Synchronization configuration
 */
export interface SyncConfig {
  /**
   * Sync strategy to use
   * - smart: Only sync on meaningful changes (default)
   * - aggressive: Sync on any change
   * - conservative: Sync only on major changes
   * @default "smart"
   */
  strategy?: SyncStrategy;

  /**
   * Debounce time in milliseconds
   * Wait this long after last change before syncing
   * @default 1000
   */
  debounceMs?: number;

  /**
   * Whether to automatically link packages
   * @default true
   */
  autoLink?: boolean;

  /**
   * Whether to show desktop notifications
   * @default false
   */
  notifications?: boolean;

  /**
   * Number of retry attempts for failed operations
   * @default 3
   */
  retryAttempts?: number;

  /**
   * Delay between retry attempts in milliseconds
   * @default 2000
   */
  retryDelayMs?: number;

  /**
   * Whether to run initial generation on startup
   * @default false
   */
  runInitialGeneration?: boolean;

  /**
   * File patterns to ignore when watching
   * @example ["test/**", "spec/**"]
   */
  ignore?: string[];

  /**
   * Whether to automatically kill processes using conflicting ports
   * @default true
   */
  autoKillConflictingPorts?: boolean;

  /**
   * Whether to show duration for each sync step
   * @default false
   */
  showStepDurations?: boolean;

  /**
   * Polling interval in milliseconds for runtime API specs
   * @default 5000
   */
  pollingInterval?: number;
}

/**
 * Logging configuration
 */
export interface LogConfig {
  /**
   * Log level
   * @default "info"
   */
  level?: 'debug' | 'info' | 'warn' | 'error';

  /**
   * Whether to use colored output
   * @default true
   */
  colors?: boolean;

  /**
   * Whether to show timestamps
   * @default false
   */
  timestamps?: boolean;

  /**
   * Log file path (optional)
   */
  file?: string;

  /**
   * Whether to show service output (stdout/stderr from backend/frontend)
   * @default true
   */
  showServiceOutput?: boolean;

  /**
   * Quiet mode - only show essential oatsjs messages
   * @default false
   */
  quiet?: boolean;
}

/**
 * Complete OATS configuration
 */
export interface OatsConfig {
  /**
   * JSON Schema reference for IntelliSense support
   * @optional
   */
  $schema?: string;

  /**
   * Configuration schema version
   * Used for migration and compatibility
   * @default "1.0.0"
   */
  version?: string;

  /**
   * Services configuration
   */
  services: ServicesConfig;

  /**
   * Synchronization configuration
   * All properties are optional with sensible defaults
   */
  sync?: SyncConfig;

  /**
   * Logging configuration
   */
  log?: LogConfig;

  /**
   * Custom metadata (for extensions)
   */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  /**
   * Whether the configuration is valid
   */
  valid: boolean;

  /**
   * Validation errors (if any)
   */
  errors: ConfigValidationError[];

  /**
   * Validation warnings (non-fatal issues)
   */
  warnings: ConfigValidationWarning[];
}

/**
 * Configuration validation error
 */
export interface ConfigValidationError {
  /**
   * Error code for programmatic handling
   */
  code: string;

  /**
   * Human-readable error message
   */
  message: string;

  /**
   * Path to the invalid configuration property
   * @example "services.backend.apiSpec.path"
   */
  path: string;

  /**
   * The invalid value (if applicable)
   */
  value?: unknown;
}

/**
 * Configuration validation warning
 */
export interface ConfigValidationWarning {
  /**
   * Warning code for programmatic handling
   */
  code: string;

  /**
   * Human-readable warning message
   */
  message: string;

  /**
   * Path to the configuration property
   */
  path: string;

  /**
   * Suggested fix or alternative
   */
  suggestion?: string;
}

/**
 * Runtime configuration (after processing and defaults)
 */
export interface RuntimeConfig extends Required<OatsConfig> {
  /**
   * Resolved absolute paths
   */
  resolvedPaths: {
    backend: string;
    client: string;
    frontend?: string;
    apiSpec: string;
  };

  /**
   * Detected package manager
   */
  packageManager: 'npm' | 'yarn' | 'pnpm';

  /**
   * Whether running in CI environment
   */
  isCI: boolean;

  /**
   * Start timestamp
   */
  startedAt: Date;
}

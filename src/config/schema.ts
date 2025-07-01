/**
 * Configuration Schema and Validation
 *
 * This module provides TypeScript-based schema validation for OATS configuration,
 * complementing the Joi validation with compile-time type checking.
 *
 * @module @oatsjs/config/schema
 */

import Joi from 'joi';

import type {
  OatsConfig,
  ApiSpecFormat,
  GeneratorType,
  SyncStrategy,
  ConfigValidationResult,
  ConfigValidationError,
  ConfigValidationWarning,
} from '../types/config.types.js';

/**
 * Valid API specification formats
 */
const API_SPEC_FORMATS: ApiSpecFormat[] = [
  'openapi3',
  'openapi2',
  'swagger2',
  'swagger1',
];

/**
 * Valid generator types
 */
const GENERATOR_TYPES: GeneratorType[] = [
  'custom',
  '@hey-api/openapi-ts',
  'swagger-typescript-api',
  'openapi-generator-cli',
];

/**
 * Valid sync strategies
 */
const SYNC_STRATEGIES: SyncStrategy[] = ['smart', 'aggressive', 'conservative'];

/**
 * Joi schema for OATS configuration
 */
export const configSchema = Joi.object<OatsConfig>({
  $schema: Joi.string()
    .optional()
    .description('JSON Schema reference for IntelliSense'),
  version: Joi.string().optional().default('1.0.0'),

  services: Joi.object({
    backend: Joi.object({
      path: Joi.string().required().messages({
        'string.empty': 'Backend path cannot be empty',
        'any.required': 'Backend path is required',
      }),
      port: Joi.number()
        .port()
        .optional()
        .when('runtime', {
          is: 'python',
          then: Joi.number().default(8000),
          otherwise: Joi.number().default(4000),
        }),
      startCommand: Joi.string().required().messages({
        'string.empty': 'Backend start command cannot be empty',
        'any.required': 'Backend start command is required',
      }),
      readyPattern: Joi.string()
        .optional()
        .when('runtime', {
          is: 'python',
          then: Joi.string().default('Uvicorn running on'),
          otherwise: Joi.string().default('Server listening on'),
        }),
      runtime: Joi.string().valid('node', 'python').optional().default('node'),
      python: Joi.when('runtime', {
        is: 'python',
        then: Joi.object({
          virtualEnv: Joi.string().optional(),
          packageManager: Joi.string()
            .valid('pip', 'poetry', 'pipenv')
            .optional()
            .default('pip'),
          executable: Joi.string().optional().default('python'),
        }).optional(),
        otherwise: Joi.forbidden(),
      }),
      apiSpec: Joi.object({
        path: Joi.string().required().messages({
          'string.empty': 'API spec path cannot be empty',
          'any.required': 'API spec path is required',
        }),
        format: Joi.string()
          .valid(...API_SPEC_FORMATS)
          .optional()
          .default('openapi3'),
        watch: Joi.array().items(Joi.string()).optional(),
      }).required(),
      env: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
      cwd: Joi.string().optional(),
    }).required(),

    client: Joi.object({
      path: Joi.string().required().messages({
        'string.empty': 'Client path cannot be empty',
        'any.required': 'Client path is required',
      }),
      packageName: Joi.string()
        .required()
        .pattern(/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/)
        .messages({
          'string.empty': 'Package name cannot be empty',
          'any.required': 'Package name is required',
          'string.pattern.base':
            'Package name must be a valid npm package name',
        }),
      generator: Joi.string()
        .valid(...GENERATOR_TYPES)
        .required(),
      generateCommand: Joi.when('generator', {
        is: 'custom',
        then: Joi.string().required().messages({
          'any.required':
            'Generate command is required when using custom generator',
        }),
        otherwise: Joi.string().optional(),
      }),
      buildCommand: Joi.string().optional(),
      linkCommand: Joi.string().optional(),
      generatorConfig: Joi.object().optional(),
      postGenerate: Joi.string().optional(),
      autoInstall: Joi.boolean().optional().default(false),
    }).required(),

    frontend: Joi.object({
      path: Joi.string().required().messages({
        'string.empty': 'Frontend path cannot be empty',
        'any.required': 'Frontend path is required',
      }),
      port: Joi.number().port().required().messages({
        'number.base': 'Frontend port must be a number',
        'number.port': 'Frontend port must be a valid port number (1-65535)',
        'any.required':
          'Frontend port is required - specify the exact port your dev server uses (e.g., 3000 for React, 5173 for Vite, 4200 for Angular)',
      }),
      startCommand: Joi.string().required().messages({
        'string.empty': 'Frontend start command cannot be empty',
        'any.required':
          'Frontend start command is required (e.g., "npm start" for React, "npm run dev" for Vite, "ng serve" for Angular)',
      }),
      packageLinkCommand: Joi.string().optional(),
      framework: Joi.string()
        .valid(
          'react',
          'vue',
          'angular',
          'svelte',
          'next',
          'nuxt',
          'auto-detect'
        )
        .optional()
        .default('auto-detect'),
      readyPattern: Joi.string().optional().default('compiled successfully'),
      env: Joi.object().pattern(Joi.string(), Joi.string()).optional(),
    }).optional(),
  }).required(),

  sync: Joi.object({
    strategy: Joi.string()
      .valid(...SYNC_STRATEGIES)
      .optional()
      .default('smart'),
    debounceMs: Joi.number().min(0).optional().default(1000),
    autoLink: Joi.boolean().optional().default(true),
    notifications: Joi.boolean().optional().default(false),
    retryAttempts: Joi.number().min(0).max(10).optional().default(3),
    retryDelayMs: Joi.number().min(0).optional().default(2000),
    runInitialGeneration: Joi.boolean().optional().default(false),
    ignore: Joi.array().items(Joi.string()).optional(),
    autoKillConflictingPorts: Joi.boolean().optional().default(true),
    showStepDurations: Joi.boolean().optional().default(false),
    pollingInterval: Joi.number().min(1000).max(60000).optional().default(5000),
  })
    .optional()
    .default({}),

  log: Joi.object({
    level: Joi.string()
      .valid('debug', 'info', 'warn', 'error')
      .optional()
      .default('info'),
    colors: Joi.boolean().optional().default(true),
    timestamps: Joi.boolean().optional().default(false),
    file: Joi.string().optional(),
    showServiceOutput: Joi.boolean().optional().default(true).messages({
      'boolean.base': 'showServiceOutput must be a boolean',
    }),
    quiet: Joi.boolean().optional().default(false).messages({
      'boolean.base': 'quiet mode must be a boolean',
    }),
  })
    .optional()
    .default({}),

  metadata: Joi.object().optional(),
});

/**
 * Validates an OATS configuration object
 *
 * @param config - The configuration to validate
 * @returns Validation result with errors and warnings
 */
export function validateConfig(config: unknown): ConfigValidationResult {
  const result: ConfigValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  // Joi validation
  const { error, value } = configSchema.validate(config, {
    abortEarly: false,
  });

  if (error) {
    result.valid = false;
    result.errors = error.details.map(
      (detail): ConfigValidationError => ({
        code: detail.type,
        message: detail.message,
        path: detail.path.join('.'),
        value: detail.context?.value,
      })
    );
  }

  // Additional custom validations
  if (result.valid && value) {
    const customErrors = performCustomValidations(value as OatsConfig);
    if (customErrors.length > 0) {
      result.valid = false;
      result.errors.push(...customErrors);
    }

    // Add warnings
    result.warnings.push(...generateWarnings(value as OatsConfig));
  }

  return result;
}

/**
 * Performs custom validations that Joi cannot handle
 *
 * @param config - The configuration to validate
 * @returns Array of validation errors
 */
function performCustomValidations(config: OatsConfig): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];

  // Check for circular dependencies
  if (config.services.backend.path === config.services.client.path) {
    errors.push({
      code: 'CIRCULAR_DEPENDENCY',
      message: 'Backend and client cannot share the same path',
      path: 'services.client.path',
      value: config.services.client.path,
    });
  }

  // Validate custom generator command
  if (
    config.services.client.generator === 'custom' &&
    !config.services.client.generateCommand
  ) {
    errors.push({
      code: 'MISSING_GENERATE_COMMAND',
      message: 'Generate command is required when using custom generator',
      path: 'services.client.generateCommand',
    });
  }

  // Validate port conflicts
  if (
    config.services.frontend &&
    config.services.backend.port === config.services.frontend.port
  ) {
    errors.push({
      code: 'PORT_CONFLICT',
      message: 'Backend and frontend cannot use the same port',
      path: 'services.frontend.port',
      value: config.services.frontend.port,
    });
  }

  return errors;
}

/**
 * Generates warnings for potential issues
 *
 * @param config - The configuration to analyze
 * @returns Array of warnings
 */
function generateWarnings(config: OatsConfig): ConfigValidationWarning[] {
  const warnings: ConfigValidationWarning[] = [];

  // Warn about missing frontend config
  if (!config.services.frontend) {
    warnings.push({
      code: 'NO_FRONTEND',
      message:
        'No frontend configuration provided. OATS will not start a frontend service.',
      path: 'services.frontend',
      suggestion:
        'Add frontend configuration if you want OATS to manage your frontend service',
    });
  }

  // Warn about aggressive sync strategy
  if (config.sync?.strategy === 'aggressive') {
    warnings.push({
      code: 'AGGRESSIVE_SYNC',
      message: 'Aggressive sync strategy may cause excessive regeneration',
      path: 'sync.strategy',
      suggestion: 'Consider using "smart" strategy for better performance',
    });
  }

  // Warn about low debounce time
  if (config.sync?.debounceMs && config.sync.debounceMs < 500) {
    warnings.push({
      code: 'LOW_DEBOUNCE',
      message: 'Low debounce time may cause excessive regeneration',
      path: 'sync.debounceMs',
      suggestion: 'Consider increasing to at least 1000ms',
    });
  }

  // Warn about missing build command
  if (!config.services.client.buildCommand) {
    warnings.push({
      code: 'NO_BUILD_COMMAND',
      message: 'No build command specified for client',
      path: 'services.client.buildCommand',
      suggestion:
        'Add a build command to ensure the client is properly compiled',
    });
  }

  return warnings;
}

/**
 * Default configuration values
 */
export const defaultConfig: Partial<OatsConfig> = {
  version: '1.0.0',
  sync: {
    strategy: 'smart',
    debounceMs: 1000,
    autoLink: true,
    notifications: false,
    retryAttempts: 3,
    retryDelayMs: 2000,
    runInitialGeneration: false,
  },
  log: {
    level: 'info',
    colors: true,
    timestamps: false,
  },
};

/**
 * Merges user configuration with defaults
 *
 * @param userConfig - User-provided configuration
 * @returns Merged configuration
 */
export function mergeWithDefaults(userConfig: OatsConfig): OatsConfig {
  return {
    ...defaultConfig,
    ...userConfig,
    sync: {
      ...defaultConfig.sync,
      ...userConfig.sync,
    },
    log: {
      ...defaultConfig.log,
      ...userConfig.log,
    },
  };
}

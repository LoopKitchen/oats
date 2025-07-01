/**
 * Configuration Loader
 *
 * Loads OATS configuration from both JSON and TypeScript files
 */

import { existsSync, readFileSync } from 'fs';
import { join, extname } from 'path';
import { pathToFileURL } from 'url';
import type { OatsConfig } from '../types/config.types.js';
import { ConfigError } from '../errors/index.js';

/**
 * Load configuration from file (supports .json and .ts)
 */
export async function loadConfigFromFile(
  configPath: string
): Promise<OatsConfig> {
  const ext = extname(configPath);

  if (ext === '.ts') {
    return loadTypeScriptConfig(configPath);
  } else if (ext === '.js') {
    return loadJavaScriptConfig(configPath);
  } else if (ext === '.json' || ext === '') {
    return loadJsonConfig(configPath);
  } else {
    throw new ConfigError(
      `Unsupported config file extension: ${ext}. Use .json, .js, or .ts`
    );
  }
}

/**
 * Load JSON configuration
 */
function loadJsonConfig(configPath: string): OatsConfig {
  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as OatsConfig;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ConfigError(
        `Invalid JSON in configuration file: ${error.message}`
      );
    }
    throw error;
  }
}

/**
 * Load JavaScript configuration
 */
async function loadJavaScriptConfig(configPath: string): Promise<OatsConfig> {
  try {
    // Convert to file URL for ESM import
    const fileUrl = pathToFileURL(configPath).href;

    // Import the JavaScript module
    const module = await import(fileUrl);

    // Support both default export and named export
    const config = module.default || module.config;

    if (!config) {
      throw new ConfigError(
        'JavaScript config must export a default config object or named export "config"'
      );
    }

    return config as OatsConfig;
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }
    throw new ConfigError(
      `Failed to load JavaScript config: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Load TypeScript configuration
 */
async function loadTypeScriptConfig(_configPath: string): Promise<OatsConfig> {
  // For now, provide a helpful error message about TypeScript configs
  // In the future, we can add support for tsx/ts-node
  throw new ConfigError(
    `TypeScript config files require additional setup.\n\n` +
      `Option 1: Convert to JSON format:\n` +
      `  - Rename oats.config.ts to oats.config.json\n` +
      `  - Remove the import and defineConfig wrapper\n` +
      `  - Add "$schema": "node_modules/@tryloop/oats/schema/oats.schema.json"\n\n` +
      `Option 2: Use a JavaScript file:\n` +
      `  - Rename oats.config.ts to oats.config.js\n` +
      `  - Change import to: const { defineConfig } = require('@tryloop/oats')\n` +
      `  - Change export to: module.exports = defineConfig({...})\n\n` +
      `Option 3: Install a TypeScript runner (coming soon):\n` +
      `  - This feature will be available in a future release`
  );
}

/**
 * Find config file in current directory
 * Searches for oats.config.json, oats.config.js, oats.config.ts in that order
 */
export function findConfigFile(cwd: string = process.cwd()): string | null {
  // Prefer JSON/JS over TS until we have proper TS support
  const configNames = ['oats.config.json', 'oats.config.js', 'oats.config.ts'];

  for (const name of configNames) {
    const configPath = join(cwd, name);
    if (existsSync(configPath)) {
      return configPath;
    }
  }

  return null;
}

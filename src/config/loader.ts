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
async function loadTypeScriptConfig(configPath: string): Promise<OatsConfig> {
  // Import the TypeScript loader
  const { loadTypeScriptConfig: loadTsConfig } = await import('./ts-loader.js');
  return loadTsConfig(configPath);
}

/**
 * Find config file in current directory
 * Searches for oats.config.ts, oats.config.js, oats.config.json in that order
 */
export function findConfigFile(cwd: string = process.cwd()): string | null {
  // Prefer TypeScript/JS over JSON for better type safety
  const configNames = ['oats.config.ts', 'oats.config.js', 'oats.config.json'];

  for (const name of configNames) {
    const configPath = join(cwd, name);
    if (existsSync(configPath)) {
      return configPath;
    }
  }

  return null;
}

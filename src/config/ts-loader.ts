/**
 * TypeScript Config Loader
 *
 * Loads TypeScript configuration files by transpiling them on the fly
 */

import { existsSync, readFileSync, unlinkSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { OatsConfig } from '../types/config.types.js';
import { ConfigError } from '../errors/index.js';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Check if esbuild is available (now always returns true since it's a dependency)
 */
async function hasEsbuild(): Promise<boolean> {
  // esbuild is now a direct dependency of OATS, so it's always available
  return true;
}

/**
 * Load TypeScript config using esbuild
 */
export async function loadTypeScriptConfig(
  configPath: string
): Promise<OatsConfig> {
  // Check if we can use esbuild
  const esbuildAvailable = await hasEsbuild();
  if (!esbuildAvailable) {
    // Fallback to simple parsing
    return parseTypeScriptConfig(configPath);
  }

  const tempFile = configPath.replace('.ts', '.temp.js');

  try {
    // Transpile TypeScript to JavaScript using esbuild
    // Use the esbuild that's bundled with OATS for consistency
    const esbuildPath = join(__dirname, '../../node_modules/.bin/esbuild');
    await execAsync(
      `${esbuildPath} ${configPath} --bundle --platform=node --format=cjs --external:@tryloop/oats --outfile=${tempFile}`
    );

    // Load the transpiled JavaScript
    const config = await import(tempFile);

    // Clean up temp file
    if (existsSync(tempFile)) {
      unlinkSync(tempFile);
    }

    // Handle the config object - esbuild wraps ESM default exports in a default property
    // when converting to CJS, but we need to check if it's a double-wrapped scenario
    if (
      config.default &&
      typeof config.default === 'object' &&
      'default' in config.default
    ) {
      // Double wrapped - take the inner default
      return config.default.default as OatsConfig;
    } else if (config.default !== undefined) {
      // Single wrapped - take the default
      return config.default as OatsConfig;
    } else {
      // Not wrapped - return as is
      return config as OatsConfig;
    }
  } catch (error) {
    // Clean up temp file on error
    if (existsSync(tempFile)) {
      unlinkSync(tempFile);
    }

    // Fallback to simple parsing
    return parseTypeScriptConfig(configPath);
  }
}

/**
 * Simple TypeScript config parser (fallback)
 */
function parseTypeScriptConfig(configPath: string): OatsConfig {
  const content = readFileSync(configPath, 'utf-8');

  // Extract the config object using eval (safe since it's user's own config)
  try {
    // Remove TypeScript-specific syntax
    const jsContent = content
      // Remove import statements
      .replace(/import\s+.*?from\s+['"].*?['"];?\s*/g, '')
      // Remove type annotations
      .replace(/:\s*(string|number|boolean|any)(\[\])?/g, '')
      // Replace export default with module.exports
      .replace(/export\s+default\s+/, 'module.exports = ')
      // Remove defineConfig wrapper
      .replace(/defineConfig\s*\(/g, '(')
      // Handle 'as const' assertions
      .replace(/as\s+const/g, '');

    // Create a function that returns the config
    const configFunc = new Function('module', 'exports', jsContent);
    const module = { exports: {} };
    configFunc(module, module.exports);

    return module.exports as OatsConfig;
  } catch (error) {
    throw new ConfigError(
      `Failed to parse TypeScript config.\n\n` +
        `For better TypeScript support, install esbuild:\n` +
        `  npm install -D esbuild\n\n` +
        `Or convert your config to JavaScript format:\n` +
        `  1. Rename oats.config.ts to oats.config.js\n` +
        `  2. Change import to: const { defineConfig } = require('@tryloop/oats')\n` +
        `  3. Change export to: module.exports = defineConfig({...})\n\n` +
        `Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * TypeScript Config Loader
 *
 * Loads TypeScript configuration files by transpiling them on the fly
 */

import { existsSync, readFileSync, unlinkSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
import type { OatsConfig } from '../types/config.types.js';
import { ConfigError } from '../errors/index.js';

const execAsync = promisify(exec);

/**
 * Check if esbuild is available
 */
async function hasEsbuild(): Promise<boolean> {
  try {
    // Check if esbuild is available locally first
    await execAsync('node_modules/.bin/esbuild --version');
    return true;
  } catch {
    // If not available locally, npx will download it
    console.log(chalk.dim('\n📦 First-time setup: downloading esbuild for TypeScript config support...'));
    console.log(chalk.dim('   This may take a minute but only happens once.\n'));
    return false;
  }
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
    // Using execAsync to avoid blocking the event loop
    await execAsync(
      `npx esbuild ${configPath} --bundle --platform=node --format=cjs --external:@tryloop/oats --outfile=${tempFile}`
    );

    // Load the transpiled JavaScript
    const config = await import(tempFile);

    // Clean up temp file
    if (existsSync(tempFile)) {
      unlinkSync(tempFile);
    }

    return (config.default || config) as OatsConfig;
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

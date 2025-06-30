/**
 * OATS Start Command
 *
 * Starts the orchestrator to watch and sync services
 *
 * @module @oatsjs/cli/start
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';

import chalk from 'chalk';

import { validateConfig, mergeWithDefaults } from '../config/schema.js';
import { DevSyncOrchestrator } from '../core/orchestrator.js';
import { ConfigError, FileSystemError } from '../errors/index.js';

import type { OatsConfig } from '../types/config.types.js';

interface StartOptions {
  config: string;
  initGen?: boolean;
  verbose?: boolean;
  notify?: boolean;
  colors?: boolean;
  oneTime?: boolean;
}

/**
 * Start OATS orchestrator
 */
export async function start(options: StartOptions): Promise<void> {
  const configPath = options.config || 'oats.config.json';
  const fullPath = join(process.cwd(), configPath);

  // Check if config exists
  if (!existsSync(fullPath)) {
    console.error(
      chalk.red(`\n❌ Configuration file not found: ${configPath}`)
    );
    console.log(chalk.yellow('\nTry one of these:'));
    console.log(chalk.cyan('  1. Run "oatsjs init" to create a configuration'));
    console.log(
      chalk.cyan('  2. Run "oatsjs detect" to auto-detect your project')
    );
    console.log(
      chalk.cyan(
        '  3. Specify a different config: "oatsjs start -c my-config.json"\n'
      )
    );
    process.exit(1);
  }

  // Set color preference
  if (options.colors === false) {
    chalk.level = 0;
  }

  try {
    // Load and validate configuration
    console.log(chalk.dim(`Loading configuration from ${configPath}...`));

    const configContent = readFileSync(fullPath, 'utf-8');
    let config: OatsConfig;

    try {
      config = JSON.parse(configContent) as OatsConfig;
    } catch (error) {
      throw new ConfigError(
        `Invalid JSON in configuration file: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Validate configuration
    const validation = validateConfig(config);

    if (!validation.valid) {
      console.error(chalk.red('\n❌ Configuration validation failed:\n'));
      validation.errors.forEach((error) => {
        console.error(chalk.red(`  • ${error.path}: ${error.message}`));
      });
      console.log(chalk.yellow('\nPlease fix these errors and try again.'));
      process.exit(1);
    }

    // Show warnings if any
    if (validation.warnings.length > 0) {
      console.warn(chalk.yellow('\n⚠️  Configuration warnings:\n'));
      validation.warnings.forEach((warning) => {
        console.warn(chalk.yellow(`  • ${warning.message}`));
        if (warning.suggestion) {
          console.warn(chalk.dim(`    💡 ${warning.suggestion}`));
        }
      });
      console.log(); // Empty line
    }

    // Create runtime config
    const runtimeConfig = mergeWithDefaults(config) as any;
    runtimeConfig.resolvedPaths = {
      backend: resolve(dirname(fullPath), runtimeConfig.services.backend.path),
      client: resolve(dirname(fullPath), runtimeConfig.services.client.path),
      frontend: runtimeConfig.services.frontend
        ? resolve(dirname(fullPath), runtimeConfig.services.frontend.path)
        : undefined,
      apiSpec: join(
        resolve(dirname(fullPath), runtimeConfig.services.backend.path),
        runtimeConfig.services.backend.apiSpec.path
      ),
    };
    runtimeConfig.packageManager = 'npm'; // Could be detected
    runtimeConfig.isCI = !!process.env['CI'];
    runtimeConfig.startedAt = new Date();

    // Create orchestrator
    const orchestrator = new DevSyncOrchestrator(runtimeConfig);

    // Start the orchestrator (signal handlers are set up internally)
    await orchestrator.start();

    // If one-time generation, exit after completion
    if (options.oneTime) {
      console.log(chalk.green('\n✅ Generation complete!'));
      await orchestrator.shutdown();
    }
  } catch (error) {
    console.error(chalk.red('\n❌ Failed to start OATS:'));

    if (error instanceof ConfigError) {
      console.error(chalk.red(`Configuration error: ${error.message}`));
    } else if (error instanceof FileSystemError) {
      console.error(chalk.red(`File system error: ${error.message}`));
    } else if (error instanceof Error) {
      console.error(chalk.red(error.message));
      if (options.verbose) {
        console.error(chalk.dim('\nStack trace:'));
        console.error(chalk.dim(error.stack));
      }
    } else {
      console.error(chalk.red(String(error)));
    }

    console.log(chalk.dim('\nFor more help: oatsjs --help'));
    process.exit(1);
  }
}

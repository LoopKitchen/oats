/**
 * OATS Start Command
 *
 * Starts the orchestrator to watch and sync services
 *
 * @module @oatsjs/cli/start
 */

import { existsSync } from 'fs';
import { join, dirname, resolve, basename } from 'path';

import chalk from 'chalk';
import ora from 'ora';

import { validateConfig, mergeWithDefaults } from '../config/schema.js';
import { loadConfigFromFile, findConfigFile } from '../config/loader.js';
import { DevSyncOrchestrator } from '../core/orchestrator.js';
import { ConfigError, FileSystemError } from '../errors/index.js';

interface StartOptions {
  config?: string;
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
  let configPath: string;
  let fullPath: string;

  if (options.config) {
    // User specified a config file
    configPath = options.config;
    fullPath = join(process.cwd(), configPath);

    if (!existsSync(fullPath)) {
      console.error(
        chalk.red(`\n❌ Configuration file not found: ${configPath}`)
      );
      process.exit(1);
    }
  } else {
    // Try to find config file (checks for .ts first, then .json)
    const foundPath = findConfigFile();
    if (!foundPath) {
      console.error(chalk.red('\n❌ No configuration file found'));
      console.log(chalk.yellow('\nTry one of these:'));
      console.log(chalk.cyan('  1. Run "oats init" to create a configuration'));
      console.log(
        chalk.cyan('  2. Run "oats detect" to auto-detect your project')
      );
      console.log(
        chalk.cyan('  3. Create oats.config.ts or oats.config.json manually\n')
      );
      process.exit(1);
    }
    fullPath = foundPath;
    configPath = basename(foundPath);
  }

  // Set color preference
  if (options.colors === false) {
    chalk.level = 0;
  }

  const configSpinner = ora(
    `Loading configuration from ${configPath}...`
  ).start();

  try {
    // Add timeout warning for first-time TypeScript config loading
    let timeoutWarning: NodeJS.Timeout | undefined;
    if (configPath.endsWith('.ts')) {
      timeoutWarning = setTimeout(() => {
        configSpinner.text = `Loading configuration (installing esbuild on first run)...`;
      }, 3000);
    }

    // Load config (supports both .json and .ts)
    const config = await loadConfigFromFile(fullPath);

    // Clear timeout if config loads quickly
    if (timeoutWarning) {
      clearTimeout(timeoutWarning);
    }

    configSpinner.text = 'Validating configuration...';

    // Validate configuration
    const validation = validateConfig(config);

    if (!validation.valid) {
      configSpinner.fail('Configuration validation failed');
      console.error(chalk.red('\n❌ Configuration validation failed:\n'));
      validation.errors.forEach((error) => {
        console.error(chalk.red(`  • ${error.path}: ${error.message}`));
      });
      console.log(chalk.yellow('\nPlease fix these errors and try again.'));
      process.exit(1);
    }

    configSpinner.succeed('Configuration loaded and validated');

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
      console.log(); // Empty line
      ora().succeed('Generation complete!');
      await orchestrator.shutdown();
    }
  } catch (error) {
    if (configSpinner.isSpinning) {
      configSpinner.fail('Failed to start OATS');
    }
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

    console.log(chalk.dim('\nFor more help: oats --help'));
    process.exit(1);
  }
}

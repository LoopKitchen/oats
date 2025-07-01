#!/usr/bin/env node

/**
 * OATSJS CLI Entry Point
 *
 * This is the main CLI interface for OATS, providing commands for:
 * - Initialization
 * - Watching and syncing
 * - Validation
 * - Auto-detection
 *
 * @module oatsjs/cli
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import chalk from 'chalk';
import { program } from 'commander';

import { detect } from '../cli/detect.js';
import { init } from '../cli/init.js';
import { start } from '../cli/start.js';
import { validate } from '../cli/validate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version
const packageJson = JSON.parse(
  readFileSync(join(dirname(__dirname), '..', 'package.json'), 'utf8')
) as { version: string; description: string };

// ASCII art logo - wheat/grain themed
const logo = chalk.yellow(`
    ██████   █████  ████████ ███████ 
   ██    ██ ██   ██    ██    ██      
   ██    ██ ███████    ██    ███████ 
   ██    ██ ██   ██    ██         ██ 
    ██████  ██   ██    ██    ███████ 
                                      
   🌾 OpenAPI TypeScript Sync        
`);

// Configure the main program
program
  .name('oats')
  .description(packageJson.description)
  .version(packageJson.version)
  .addHelpText('before', logo)
  .showHelpAfterError('(add --help for additional information)');

// Init command
program
  .command('init')
  .description('Initialize OATS configuration interactively')
  .option('-f, --force', 'overwrite existing configuration')
  .option('-y, --yes', 'skip prompts and use defaults')
  .option('-t, --template <template>', 'use a specific template', 'default')
  .action(
    async (options: { force?: boolean; yes?: boolean; template?: string }) => {
      try {
        await init(options);
      } catch (error) {
        console.error(
          chalk.red('Error:'),
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    }
  );

// Start command (also aliased as 'watch')
program
  .command('start')
  .alias('watch')
  .description('Start OATS orchestrator and watch for changes')
  .option('-c, --config <path>', 'path to configuration file')
  .option('--init-gen', 'run initial client generation on startup')
  .option('-v, --verbose', 'verbose output')
  .option('--no-notify', 'disable desktop notifications')
  .option('--no-colors', 'disable colored output')
  .action(
    async (options: {
      config: string;
      initGen?: boolean;
      verbose?: boolean;
      notify?: boolean;
      colors?: boolean;
    }) => {
      try {
        await start(options);
      } catch (error) {
        console.error(
          chalk.red('Error:'),
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }
    }
  );

// Generate command (one-time generation)
program
  .command('generate')
  .alias('gen')
  .description('Generate TypeScript client from OpenAPI spec (one-time)')
  .option('-c, --config <path>', 'path to configuration file')
  .option('-w, --watch', 'continue watching after generation')
  .action(async (options: { config?: string; watch?: boolean }) => {
    try {
      // For now, use start with a flag - will implement separate generate action
      await start({ ...options, oneTime: true });
    } catch (error) {
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

// Detect command
program
  .command('detect')
  .description('Auto-detect project structure and generate config')
  .option(
    '-o, --output <path>',
    'output path for configuration',
    'oats.config.json'
  )
  .option('-f, --force', 'overwrite existing configuration')
  .action(async (options: { output: string; force?: boolean }) => {
    try {
      await detect(options);
    } catch (error) {
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate')
  .alias('check')
  .description('Validate OATS configuration file')
  .option('-c, --config <path>', 'path to configuration file')
  .option('-s, --strict', 'enable strict validation')
  .action(async (options: { config?: string; strict?: boolean }) => {
    try {
      await validate(options);
    } catch (error) {
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

// Examples command
program
  .command('examples')
  .description('Show OATS usage examples')
  .action(() => {
    console.log(chalk.bold('\n🌾 OATS Examples\n'));

    console.log(chalk.cyan('Basic usage:'));
    console.log('  $ oats init                  # Initialize configuration');
    console.log(
      '  $ oats start                 # Start watching and syncing\n'
    );

    console.log(chalk.cyan('Watch with custom config:'));
    console.log('  $ oats watch --config my-config.json\n');

    console.log(chalk.cyan('Auto-detect setup:'));
    console.log('  $ oats detect                # Detect project structure');
    console.log(
      '  $ oats start                 # Start with detected config\n'
    );

    console.log(chalk.cyan('One-time generation:'));
    console.log('  $ oats generate              # Generate once and exit\n');

    console.log(chalk.cyan('Initial generation on startup:'));
    console.log('  $ oats start --init-gen      # Generate before watching\n');

    console.log(chalk.cyan('Validate configuration:'));
    console.log('  $ oats validate              # Check if config is valid');
    console.log('  $ oats validate --strict     # Strict validation\n');

    console.log(chalk.dim('For more information, visit:'));
    console.log(chalk.dim('https://github.com/shekhardtu/oatsjs'));
  });

// Status command (future enhancement)
program
  .command('status')
  .description('Show current OATS status and running services')
  .action(() => {
    console.log(chalk.yellow('Status command not yet implemented'));
    console.log(chalk.dim('This will show running services and sync status'));
  });

// Handle unknown commands
program.on('command:*', (operands) => {
  console.error(chalk.red(`Error: unknown command '${operands[0]}'`));
  console.log(chalk.dim('\nRun oats --help to see available commands'));
  process.exit(1);
});

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

// Parse command line arguments
program.parse();

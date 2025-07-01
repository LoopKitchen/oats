/**
 * OATS Init Command
 *
 * Interactive initialization of OATS configuration
 *
 * @module @oatsjs/cli/init
 */

import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';

import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';

import { validateConfig } from '../config/schema.js';

import { detectProjectStructure } from './detect.js';

import type { OatsConfig } from '../types/config.types.js';

interface InitOptions {
  force?: boolean;
  yes?: boolean;
  template?: string;
}

interface ProjectAnswers {
  projectType: 'monorepo' | 'separate' | 'custom';
  backendPath: string;
  backendPort: number;
  backendCommand: string;
  apiSpecPath: string;
  clientPath: string;
  clientPackageName: string;
  clientGenerator: string;
  clientBuildCommand: string;
  includeFrontend: boolean;
  frontendPath?: string;
  frontendPort?: number;
  frontendCommand?: string;
  enableNotifications: boolean;
  syncStrategy: 'smart' | 'aggressive' | 'conservative';
}

const PROJECT_TEMPLATES = {
  monorepo: {
    name: 'Monorepo (e.g., Lerna, Nx, Rush)',
    backend: './packages/backend',
    client: './packages/api-client',
    frontend: './packages/frontend',
  },
  separate: {
    name: 'Separate repositories',
    backend: '../backend',
    client: '../api-client',
    frontend: '../frontend',
  },
  custom: {
    name: 'Custom structure',
    backend: './backend',
    client: './client',
    frontend: './frontend',
  },
};

/**
 * Initialize OATS configuration
 */
export async function init(options: InitOptions): Promise<void> {
  console.log(chalk.yellow('\n🌾 Welcome to OATSJS!\n'));
  console.log(
    chalk.dim("Let's set up your OpenAPI TypeScript sync configuration.\n")
  );

  const configPath = join(process.cwd(), 'oats.config.json');

  // Check if config already exists
  if (existsSync(configPath) && !options.force) {
    if (!options.yes) {
      const { overwrite } = await inquirer.prompt<{ overwrite: boolean }>([
        {
          type: 'confirm',
          name: 'overwrite',
          message: 'oats.config.json already exists. Overwrite?',
          default: false,
        },
      ]);

      if (!overwrite) {
        console.log(chalk.yellow('\nInit cancelled.'));
        return;
      }
    }
  }

  let config: OatsConfig;

  if (options.yes) {
    // Use defaults for --yes flag
    config = await createDefaultConfig();
  } else {
    // Interactive setup
    config = await interactiveSetup();
  }

  // Validate the configuration
  const spinner = ora('Validating configuration...').start();
  const validation = validateConfig(config);

  if (!validation.valid) {
    spinner.fail('Configuration validation failed');
    console.error(chalk.red('\nValidation errors:'));
    validation.errors.forEach((error) => {
      console.error(chalk.red(`  - ${error.path}: ${error.message}`));
    });
    return;
  }

  if (validation.warnings.length > 0) {
    spinner.warn('Configuration has warnings');
    console.warn(chalk.yellow('\nWarnings:'));
    validation.warnings.forEach((warning) => {
      console.warn(chalk.yellow(`  - ${warning.message}`));
      if (warning.suggestion) {
        console.warn(chalk.dim(`    💡 ${warning.suggestion}`));
      }
    });
  } else {
    spinner.succeed('Configuration validated');
  }

  // Write configuration
  const writeSpinner = ora('Writing configuration...').start();
  try {
    // Add $schema property for IntelliSense
    const configWithSchema = {
      $schema: 'node_modules/@tryloop/oats/schema/oats.schema.json',
      ...config,
    };
    const configContent = JSON.stringify(configWithSchema, null, 2);
    writeFileSync(configPath, configContent);
    writeSpinner.succeed('Configuration created!');

    console.log(`\n${chalk.green('✅ OATSJS initialized successfully!')}`);
    console.log(
      `\n${chalk.bold('Configuration saved to:')}`,
      chalk.cyan(configPath)
    );

    console.log(`\n${chalk.bold('Next steps:')}`);
    console.log(chalk.cyan('  1. Review your configuration:'));
    console.log(chalk.dim(`     cat ${configPath}`));
    console.log(chalk.cyan('  2. Start watching and syncing:'));
    console.log(chalk.dim('     oats start'));
    console.log(chalk.cyan('  3. Or run with initial generation:'));
    console.log(chalk.dim('     oats start --init-gen'));

    console.log(`\n${chalk.dim('For more help: oats --help')}`);
    console.log(
      chalk.dim(
        '\nTip: For better IntelliSense, you can also use TypeScript config:'
      )
    );
    console.log(
      chalk.dim(
        '     Create oats.config.ts and import { defineConfig } from "@tryloop/oats"'
      )
    );
  } catch (error) {
    writeSpinner.fail('Failed to create configuration');
    console.error(
      chalk.red(error instanceof Error ? error.message : String(error))
    );
    process.exit(1);
  }
}

/**
 * Create default configuration
 */
async function createDefaultConfig(): Promise<OatsConfig> {
  // Try to detect project structure
  const detectionSpinner = ora('Detecting project structure...').start();

  try {
    const detected = await detectProjectStructure(process.cwd());
    detectionSpinner.succeed('Project structure detected');

    // Convert detected structure to config
    return {
      services: {
        backend: {
          path: detected.backend?.path || './backend',
          port: 4000,
          startCommand:
            detected.backend?.packageManager === 'yarn'
              ? 'yarn dev'
              : 'npm run dev',
          apiSpec: {
            path: detected.backend?.apiSpec || 'src/swagger.json',
          },
        },
        client: {
          path: detected.client?.path || './api-client',
          packageName: '@myorg/api-client',
          generator: 'custom',
          generateCommand:
            detected.client?.packageManager === 'yarn'
              ? 'yarn generate'
              : 'npm run generate',
          buildCommand:
            detected.client?.packageManager === 'yarn'
              ? 'yarn build'
              : 'npm run build',
          linkCommand:
            detected.client?.packageManager === 'yarn'
              ? 'yarn link'
              : 'npm link',
        },
        frontend: detected.frontend
          ? {
              path: detected.frontend.path,
              port: 3000,
              startCommand:
                detected.frontend.packageManager === 'yarn'
                  ? 'yarn dev'
                  : 'npm run dev',
              packageLinkCommand:
                detected.frontend.packageManager === 'yarn'
                  ? 'yarn link'
                  : 'npm link',
            }
          : undefined,
      },
    };
  } catch {
    detectionSpinner.warn('Could not detect project structure, using defaults');

    // Fallback to basic defaults
    return {
      services: {
        backend: {
          path: './backend',
          port: 4000,
          startCommand: 'npm run dev',
          apiSpec: {
            path: 'src/swagger.json',
          },
        },
        client: {
          path: './api-client',
          packageName: '@myorg/api-client',
          generator: 'custom',
          generateCommand: 'npm run generate',
          buildCommand: 'npm run build',
          linkCommand: 'npm link',
        },
      },
    };
  }
}

/**
 * Interactive setup
 */
async function interactiveSetup(): Promise<OatsConfig> {
  console.log(chalk.bold("Let's configure your services:\n"));

  const answers = await inquirer.prompt<ProjectAnswers>([
    {
      type: 'list',
      name: 'projectType',
      message: "What's your project structure?",
      choices: Object.entries(PROJECT_TEMPLATES).map(([key, value]) => ({
        name: value.name,
        value: key,
      })),
    },
    {
      type: 'input',
      name: 'backendPath',
      message: 'Backend path:',
      default: (answers: ProjectAnswers) =>
        PROJECT_TEMPLATES[answers.projectType].backend,
      validate: (input: string) =>
        input.length > 0 || 'Backend path is required',
    },
    {
      type: 'number',
      name: 'backendPort',
      message: 'Backend port:',
      default: 4000,
      validate: (input: number) => {
        if (input < 1 || input > 65535) {
          return 'Port must be between 1 and 65535';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'backendCommand',
      message: 'Backend start command:',
      default: 'npm run dev',
    },
    {
      type: 'input',
      name: 'apiSpecPath',
      message: 'API spec path (relative to backend):',
      default: 'src/swagger.json',
      validate: (input: string) =>
        input.length > 0 || 'API spec path is required',
    },
    {
      type: 'input',
      name: 'clientPath',
      message: 'Client path:',
      default: (answers: ProjectAnswers) =>
        PROJECT_TEMPLATES[answers.projectType].client,
      validate: (input: string) =>
        input.length > 0 || 'Client path is required',
    },
    {
      type: 'input',
      name: 'clientPackageName',
      message: 'Client package name:',
      default: '@myorg/api-client',
      validate: (input: string) => {
        if (
          !input.match(/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/)
        ) {
          return 'Invalid package name format';
        }
        return true;
      },
    },
    {
      type: 'list',
      name: 'clientGenerator',
      message: 'Client generator:',
      choices: [
        { name: 'Custom (use your existing generator)', value: 'custom' },
        { name: '@hey-api/openapi-ts', value: '@hey-api/openapi-ts' },
        { name: 'swagger-typescript-api', value: 'swagger-typescript-api' },
        { name: 'openapi-generator-cli', value: 'openapi-generator-cli' },
      ],
      default: 'custom',
    },
    {
      type: 'input',
      name: 'clientBuildCommand',
      message: 'Client build command:',
      default: 'npm run build',
      when: (answers: ProjectAnswers) => answers.clientGenerator === 'custom',
    },
    {
      type: 'confirm',
      name: 'includeFrontend',
      message: 'Do you want OATS to manage your frontend service?',
      default: false,
    },
    {
      type: 'input',
      name: 'frontendPath',
      message: 'Frontend path:',
      default: (answers: ProjectAnswers) =>
        PROJECT_TEMPLATES[answers.projectType].frontend,
      when: (answers: ProjectAnswers) => answers.includeFrontend,
    },
    {
      type: 'number',
      name: 'frontendPort',
      message: 'Frontend port:',
      default: 3000,
      when: (answers: ProjectAnswers) => answers.includeFrontend,
      validate: (input: number, answers?: ProjectAnswers) => {
        if (input < 1 || input > 65535) {
          return 'Port must be between 1 and 65535';
        }
        if (answers && input === answers.backendPort) {
          return 'Frontend port must be different from backend port';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'frontendCommand',
      message: 'Frontend start command:',
      default: 'npm run dev',
      when: (answers: ProjectAnswers) => answers.includeFrontend,
    },
    {
      type: 'confirm',
      name: 'enableNotifications',
      message: 'Enable desktop notifications?',
      default: false,
    },
    {
      type: 'list',
      name: 'syncStrategy',
      message: 'Sync strategy:',
      choices: [
        {
          name: 'Smart (recommended) - Only sync on meaningful changes',
          value: 'smart',
        },
        { name: 'Aggressive - Sync on any change', value: 'aggressive' },
        {
          name: 'Conservative - Only sync on major changes',
          value: 'conservative',
        },
      ],
      default: 'smart',
    },
  ]);

  // Build configuration
  const config: OatsConfig = {
    services: {
      backend: {
        path: answers.backendPath,
        port: answers.backendPort,
        startCommand: answers.backendCommand,
        apiSpec: {
          path: answers.apiSpecPath,
        },
      },
      client: {
        path: answers.clientPath,
        packageName: answers.clientPackageName,
        generator: answers.clientGenerator as any,
        generateCommand:
          answers.clientGenerator === 'custom' ? 'npm run generate' : undefined,
        buildCommand: answers.clientBuildCommand || 'npm run build',
        linkCommand: 'npm link',
      },
    },
    sync: {
      strategy: answers.syncStrategy,
      notifications: answers.enableNotifications,
    },
  };

  // Add frontend if included
  if (answers.includeFrontend && answers.frontendPath) {
    config.services.frontend = {
      path: answers.frontendPath,
      port: answers.frontendPort || 3000,
      startCommand: answers.frontendCommand || 'npm run dev',
      packageLinkCommand: 'npm link',
    };
  }

  return config;
}

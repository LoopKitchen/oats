/**
 * OATS Development Sync Engine
 *
 * Optimized file watching and synchronization system
 *
 * @module @oatsjs/core/dev-sync-optimized
 */

import { EventEmitter } from 'events';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, basename } from 'path';

import chalk from 'chalk';
import { watch } from 'chokidar';
import debounce from 'lodash.debounce';
import ora from 'ora';

import { ApiSpecError, GeneratorError } from '../errors/index.js';
import { PlatformUtils } from '../utils/platform.js';
import { Logger } from '../utils/logger.js';

import { SwaggerChangeDetector } from './swagger-diff.js';

import type { RuntimeConfig } from '../types/config.types.js';

export interface SyncEvent {
  type:
    | 'spec-changed'
    | 'generation-started'
    | 'generation-completed'
    | 'generation-failed';
  timestamp: Date;
  file?: string;
  changes?: string[];
  error?: Error;
}

/**
 * Development synchronization engine
 */
export class DevSyncEngine extends EventEmitter {
  private config: RuntimeConfig;
  private watcher?: any;
  private changeDetector: SwaggerChangeDetector;
  private debouncedSync: () => void;
  private isRunning = false;
  private lastSyncTime?: Date;
  private syncLock = false;
  private syncRetries = 0;
  private readonly MAX_SYNC_RETRIES = 3;
  private pollingInterval?: NodeJS.Timeout;
  private lastGeneratedSpecHash?: string;
  private logger: Logger;

  constructor(config: RuntimeConfig) {
    super();
    this.config = config;
    this.changeDetector = new SwaggerChangeDetector();
    this.logger = new Logger('DevSyncEngine');

    // Setup debounced sync function with platform-specific timing
    const debounceMs =
      this.config.sync.debounceMs || PlatformUtils.getFileWatcherDebounce();
    this.debouncedSync = debounce(this.performSync.bind(this), debounceMs);
  }

  /**
   * Start watching for changes
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    const isRuntimeSpec =
      this.config.services.backend.apiSpec.path.startsWith('runtime:') ||
      this.config.services.backend.apiSpec.path.startsWith('/');

    if (isRuntimeSpec) {
      // For runtime specs, use polling instead of file watching
      if (!this.config.log?.quiet) {
        this.logger.info(chalk.blue('👁️  Starting OpenAPI spec polling...'));
      }

      const pollIntervalMs = this.config.sync.pollingInterval || 5000; // Default 5 seconds

      if (!this.config.log?.quiet) {
        this.logger.debug(
          chalk.dim(`📊 Polling interval: ${pollIntervalMs}ms`)
        );
      }

      // Start polling
      this.pollingInterval = setInterval(() => {
        this.debouncedSync();
      }, pollIntervalMs);

      this.isRunning = true;

      if (!this.config.log?.quiet) {
        ora().succeed('OpenAPI spec polling started');
      }
    } else {
      // For static specs, use file watching
      if (!this.config.log?.quiet) {
        this.logger.info(chalk.blue('👁️  Starting file watcher...'));
      }

      try {
        const watchPaths = this.getWatchPaths();

        if (!this.config.log?.quiet) {
          this.logger.debug(chalk.dim('📂 Watching paths:'), watchPaths);
        }

        const ignored = this.config.sync.ignore || [
          '**/node_modules/**',
          '**/.git/**',
        ];

        this.watcher = watch(watchPaths, {
          ignored,
          persistent: true,
          ignoreInitial: true,
          awaitWriteFinish: {
            stabilityThreshold: 300,
            pollInterval: 100,
          },
        });

        this.watcher.on('change', this.handleFileChange.bind(this));
        this.watcher.on('add', this.handleFileChange.bind(this));
        this.watcher.on('error', this.handleWatchError.bind(this));

        this.isRunning = true;
        if (!this.config.log?.quiet) {
          ora().succeed('File watcher started');
        }
      } catch (error) {
        this.logger.error(chalk.red('❌ Failed to start file watcher:'), error);
        throw error;
      }
    }

    // Run initial sync if configured
    if (this.config.sync.runInitialGeneration) {
      if (!this.config.log?.quiet) {
        this.logger.info(chalk.blue('🔄 Running initial sync...'));
      }
      await this.performSync();
    }

    this.emit('started');
  }

  /**
   * Stop watching for changes
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    if (!this.config.log?.quiet) {
      console.log(chalk.yellow('🔄 Stopping sync engine...'));
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }

    this.isRunning = false;
    if (!this.config.log?.quiet) {
      ora().succeed('Sync engine stopped');
    }
    this.emit('stopped');
  }

  /**
   * Get current sync status
   */
  getStatus(): {
    isRunning: boolean;
    lastSyncTime?: Date;
    watchedPaths: string[];
  } {
    return {
      isRunning: this.isRunning,
      lastSyncTime: this.lastSyncTime,
      watchedPaths: this.getWatchPaths(),
    };
  }

  /**
   * Handle file change events
   */
  private handleFileChange(filePath: string): void {
    this.logger.debug(chalk.gray(`📝 File changed: ${filePath}`));

    // Check if this is an API spec file or related file
    const isRelevant = this.isRelevantFile(filePath);
    this.logger.debug(chalk.dim(`   Is relevant: ${isRelevant}`));

    if (isRelevant) {
      this.logger.info(
        chalk.blue('🔄 API-related file changed, scheduling sync...')
      );
      this.debouncedSync();
    } else {
      this.logger.debug(chalk.dim('   Ignoring non-relevant file'));
    }
  }

  /**
   * Handle watch errors
   */
  private handleWatchError(error: Error): void {
    this.logger.error(chalk.red('👁️  File watcher error:'), error);
    this.emit('error', error);
  }

  /**
   * Perform synchronization
   */
  private async performSync(): Promise<void> {
    // Prevent concurrent sync operations
    if (this.syncLock) {
      this.logger.debug(
        chalk.yellow('⏳ Sync already in progress, skipping...')
      );
      return;
    }

    this.syncLock = true;
    const showDurations = this.config.sync.showStepDurations ?? false;
    const syncStartTime = Date.now();

    try {
      const event: SyncEvent = {
        type: 'generation-started',
        timestamp: new Date(),
      };
      this.emit('sync-event', event);

      this.logger.info(chalk.blue('🔄 Starting synchronization...'));

      // Check if API spec has meaningful changes
      const checkStartTime = Date.now();
      const hasChanges = await this.checkForMeaningfulChanges();
      if (showDurations) {
        this.logger.debug(
          chalk.dim(`  ⏱️  Change detection: ${Date.now() - checkStartTime}ms`)
        );
      }

      if (!hasChanges && this.config.sync.strategy === 'smart') {
        this.logger.debug(chalk.gray('📊 No meaningful API changes detected'));
        return;
      }

      // Generate TypeScript client
      const genStartTime = Date.now();
      await this.generateClient();
      if (showDurations) {
        this.logger.debug(
          chalk.dim(`  ⏱️  Client generation: ${Date.now() - genStartTime}ms`)
        );
      }

      // Build client if needed
      if (this.config.services.client.buildCommand) {
        const buildStartTime = Date.now();
        await this.buildClient();
        if (showDurations) {
          this.logger.debug(
            chalk.dim(`  ⏱️  Client build: ${Date.now() - buildStartTime}ms`)
          );
        }
      }

      // Link packages if auto-link is enabled
      if (this.config.sync.autoLink) {
        const linkStartTime = Date.now();
        await this.linkPackages();
        if (showDurations) {
          this.logger.debug(
            chalk.dim(`  ⏱️  Package linking: ${Date.now() - linkStartTime}ms`)
          );
        }
      }

      this.lastSyncTime = new Date();
      this.syncRetries = 0; // Reset retry count on success

      const totalDuration = Date.now() - syncStartTime;
      const endTime = new Date().toISOString();

      if (showDurations) {
        ora().succeed(`Synchronization completed in ${totalDuration}ms total`);
      } else {
        ora().succeed(`Synchronization completed successfully at ${endTime}`);
      }

      const completedEvent: SyncEvent = {
        type: 'generation-completed',
        timestamp: new Date(),
      };
      this.emit('sync-event', completedEvent);
    } catch (error) {
      this.logger.error(chalk.red('❌ Synchronization failed:'), error);

      const failedEvent: SyncEvent = {
        type: 'generation-failed',
        timestamp: new Date(),
        error: error as Error,
      };
      this.emit('sync-event', failedEvent);

      // Retry logic with exponential backoff
      if (this.syncRetries < this.MAX_SYNC_RETRIES) {
        this.syncRetries++;
        const retryDelay = Math.pow(2, this.syncRetries) * 1000;
        this.logger.warn(
          chalk.yellow(
            `🔄 Retrying sync in ${retryDelay}ms (attempt ${this.syncRetries}/${this.MAX_SYNC_RETRIES})...`
          )
        );
        setTimeout(() => {
          this.syncLock = false;
          this.performSync();
        }, retryDelay);
      } else {
        this.logger.error(
          chalk.red(
            '❌ Max sync retries exceeded. Manual intervention required.'
          )
        );
        this.syncRetries = 0;
      }
    } finally {
      this.syncLock = false;
    }
  }

  /**
   * Check for meaningful changes in API spec
   */
  private async checkForMeaningfulChanges(): Promise<boolean> {
    // Handle runtime API specs (e.g., FastAPI)
    const isRuntimeSpec =
      this.config.services.backend.apiSpec.path.startsWith('runtime:') ||
      this.config.services.backend.apiSpec.path.startsWith('/');

    if (isRuntimeSpec) {
      // For runtime specs, fetch from endpoint and compare
      const runtimePath = this.config.services.backend.apiSpec.path.replace(
        'runtime:',
        ''
      );
      const apiUrl = `http://localhost:${this.config.services.backend.port}${runtimePath}`;

      try {
        const response = await fetch(apiUrl, {
          signal: AbortSignal.timeout(5000), // 5 second timeout
        });

        if (!response.ok) {
          this.logger.warn(
            chalk.yellow(
              `Failed to fetch spec for comparison: ${response.statusText}`
            )
          );
          // If we can't fetch the spec, assume it might have changed
          return true;
        }

        const currentSpec = await response.json();
        const hasChanges =
          this.changeDetector.hasSignificantChanges(currentSpec);

        // Store the current spec hash if we're going to generate
        if (hasChanges) {
          this.lastGeneratedSpecHash =
            this.changeDetector.getCurrentHash() || undefined;
        }

        return hasChanges;
      } catch (error) {
        this.logger.warn(
          chalk.yellow(`Error fetching spec for comparison: ${error}`)
        );
        // If there's an error, assume changes to be safe
        return true;
      }
    }

    // For static specs, read from file system
    const specPath = join(
      this.config.resolvedPaths.backend,
      this.config.services.backend.apiSpec.path
    );

    if (!existsSync(specPath)) {
      throw new ApiSpecError(`API spec file not found: ${specPath}`, specPath);
    }

    try {
      const currentSpec = JSON.parse(readFileSync(specPath, 'utf-8'));
      return this.changeDetector.hasSignificantChanges(currentSpec);
    } catch (error) {
      throw new ApiSpecError(`Failed to parse API spec: ${error}`, specPath);
    }
  }

  /**
   * Generate TypeScript client
   */
  private async generateClient(): Promise<void> {
    const spinner = ora('Generating TypeScript client...').start();
    const showDurations = this.config.sync.showStepDurations ?? false;

    try {
      // Extract filename from apiSpec path (e.g., '/openapi.json' -> 'openapi.json')
      const specFilename =
        basename(this.config.services.backend.apiSpec.path) || 'openapi.json';

      const clientSwaggerPath = join(
        this.config.resolvedPaths.client,
        specFilename
      );

      // Check if we can skip generation based on spec hash
      const specHashPath = join(
        this.config.resolvedPaths.client,
        '.openapi-hash'
      );

      try {
        if (existsSync(specHashPath) && this.lastGeneratedSpecHash) {
          const savedHash = readFileSync(specHashPath, 'utf-8').trim();
          if (savedHash === this.lastGeneratedSpecHash) {
            spinner.info('Client already up-to-date with current spec');
            this.logger.debug(
              chalk.gray('📊 Client already up-to-date with current spec')
            );
            return; // Skip generation entirely
          }
        }
      } catch (err) {
        // Continue with generation
      }

      // Handle runtime API specs (e.g., FastAPI)
      const isRuntimeSpec =
        this.config.services.backend.apiSpec.path.startsWith('runtime:') ||
        this.config.services.backend.apiSpec.path.startsWith('/');

      if (isRuntimeSpec) {
        const runtimePath = this.config.services.backend.apiSpec.path.replace(
          'runtime:',
          ''
        );
        const apiUrl = `http://localhost:${this.config.services.backend.port}${runtimePath}`;

        spinner.text = `Fetching OpenAPI spec from ${apiUrl}...`;
        this.logger.debug(chalk.dim(`Fetching OpenAPI spec from ${apiUrl}...`));

        // Retry logic for runtime specs - backend might still be starting
        const maxRetries = 5;
        const retryDelay = 3000; // 3 seconds

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const attemptStartTime = Date.now();
            const response = await fetch(apiUrl, {
              signal: AbortSignal.timeout(10000), // 10 second timeout
            });

            if (!response.ok) {
              throw new Error(
                `Failed to fetch OpenAPI spec: ${response.statusText}`
              );
            }

            const spec = await response.json();

            const { writeFileSync } = await import('fs');
            writeFileSync(clientSwaggerPath, JSON.stringify(spec, null, 2));

            if (showDurations) {
              this.logger.debug(
                chalk.dim(
                  `    ⏱️  Fetched OpenAPI spec: ${Date.now() - attemptStartTime}ms`
                )
              );
            } else {
              this.logger.debug(
                chalk.dim('Fetched and saved OpenAPI spec from runtime')
              );
            }

            // Success - break out of retry loop
            break;
          } catch (error) {
            this.logger.warn(
              chalk.yellow(`Attempt ${attempt}/${maxRetries} failed: ${error}`)
            );

            if (attempt < maxRetries) {
              this.logger.debug(
                chalk.dim(`Waiting ${retryDelay}ms before retry...`)
              );
              await new Promise((resolve) => setTimeout(resolve, retryDelay));
            } else {
              this.logger.error(
                chalk.red(
                  'Failed to fetch runtime OpenAPI spec after all retries:'
                ),
                error
              );
              throw new ApiSpecError(
                `Failed to fetch runtime API spec after ${maxRetries} attempts: ${error}`,
                apiUrl
              );
            }
          }
        }
      } else {
        // Copy static swagger.json to client directory
        const specPath = join(
          this.config.resolvedPaths.backend,
          this.config.services.backend.apiSpec.path
        );

        try {
          const { copyFileSync } = await import('fs');
          copyFileSync(specPath, clientSwaggerPath);
          this.logger.debug(
            chalk.dim('Copied swagger.json to client directory')
          );
        } catch (error) {
          this.logger.error(chalk.red('Failed to copy swagger.json:'), error);
        }
      }

      // Clean generated files before regeneration to avoid caching issues
      try {
        const cleanStartTime = Date.now();
        const srcPath = join(this.config.resolvedPaths.client, 'src');
        const { rmSync } = await import('fs');
        rmSync(srcPath, { recursive: true, force: true });

        if (showDurations) {
          this.logger.debug(
            chalk.dim(
              `    ⏱️  Cleaned generated files: ${Date.now() - cleanStartTime}ms`
            )
          );
        } else {
          this.logger.debug(chalk.dim('Cleaned generated files'));
        }
      } catch (err) {
        // Ignore errors, src directory might not exist
      }

      // Implementation depends on generator type
      const { generator, generateCommand } = this.config.services.client;
      const genCommandStartTime = Date.now();

      spinner.text = 'Running client generation command...';

      if (generateCommand) {
        // Use the specified generate command
        await this.runCommand(
          generateCommand,
          this.config.resolvedPaths.client
        );
      } else if (generator === '@hey-api/openapi-ts') {
        // Default command for @hey-api/openapi-ts
        await this.runCommand(
          'npx @hey-api/openapi-ts',
          this.config.resolvedPaths.client
        );
      } else {
        throw new GeneratorError(
          `No generate command specified for generator ${generator}`,
          generator,
          'generate'
        );
      }

      if (showDurations) {
        spinner.text = `TypeScript client generated (${Date.now() - genCommandStartTime}ms)`;
      }

      // Save the spec hash after successful generation
      if (this.lastGeneratedSpecHash) {
        try {
          const { writeFileSync } = await import('fs');
          writeFileSync(specHashPath, this.lastGeneratedSpecHash, 'utf-8');
        } catch (err) {
          // Non-critical, continue
        }
      }

      spinner.succeed('TypeScript client generated successfully');
    } catch (error) {
      spinner.fail('Failed to generate TypeScript client');
      throw error;
    }
  }

  /**
   * Build client package
   */
  private async buildClient(): Promise<void> {
    const { buildCommand } = this.config.services.client;
    if (!buildCommand) return;

    const spinner = ora('Building client package...').start();

    try {
      // Check if fast build is available and we're in development
      const packageJsonPath = join(
        this.config.resolvedPaths.client,
        'package.json'
      );
      let useFastBuild = false;

      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        if (packageJson.scripts && packageJson.scripts['build:fast']) {
          useFastBuild = true;
        }
      } catch (err) {
        // Ignore, use regular build
      }

      const commandToRun = useFastBuild
        ? buildCommand.replace('build', 'build:fast')
        : buildCommand;

      spinner.text = useFastBuild
        ? 'Running fast build...'
        : 'Running build command...';
      await this.runCommand(commandToRun, this.config.resolvedPaths.client);

      // Update package.json with OATS metadata after successful build
      await this.updateClientVersionMetadata();

      spinner.succeed('Client package built successfully');
    } catch (error) {
      spinner.fail('Failed to build client package');
      throw error;
    }
  }

  /**
   * Update client package.json with OATS metadata
   */
  private async updateClientVersionMetadata(): Promise<void> {
    const packageJsonPath = join(
      this.config.resolvedPaths.client,
      'package.json'
    );

    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

      // Add OATS metadata
      packageJson._oats = {
        generated: new Date().toISOString(),
        apiSpecHash: this.lastGeneratedSpecHash || 'unknown',
        version: packageJson.version || '1.0.0',
      };

      // Write back the updated package.json
      writeFileSync(
        packageJsonPath,
        `${JSON.stringify(packageJson, null, 2)}\n`
      );

      this.logger.debug(
        chalk.dim(`Updated client metadata with API spec hash`)
      );
    } catch (error) {
      this.logger.warn('Failed to update client version metadata:', error);
      // Non-critical error, continue
    }
  }

  /**
   * Link packages for local development
   */
  private async linkPackages(): Promise<void> {
    const { linkCommand } = this.config.services.client;
    if (!linkCommand) return;

    const spinner = ora('Linking packages...').start();

    try {
      // Link the client package
      await this.runCommand(linkCommand, this.config.resolvedPaths.client);

      // Link in frontend if configured
      if (this.config.services.frontend) {
        const frontendLinkCommand =
          this.config.services.frontend.packageLinkCommand ||
          `${this.config.packageManager} link ${this.config.services.client.packageName}`;

        await this.runCommand(
          frontendLinkCommand,
          this.config.resolvedPaths.frontend!
        );
      }

      // Emit event to track linked packages
      const linkedPaths = [this.config.resolvedPaths.client];
      if (this.config.services.frontend) {
        linkedPaths.push(this.config.resolvedPaths.frontend!);
      }

      this.emit('packages-linked', {
        clientPackage: this.config.services.client.packageName,
        paths: linkedPaths,
      });

      // Touch a file in frontend to trigger HMR
      if (this.config.services.frontend) {
        try {
          const touchFile = join(
            this.config.resolvedPaths.frontend!,
            'src',
            '.oats-sync'
          );
          await PlatformUtils.touchFile(touchFile);
          this.logger.debug(chalk.dim('Triggered frontend HMR'));
        } catch (err) {
          // Ignore errors, this is optional
        }
      }

      spinner.succeed('Packages linked successfully');
    } catch (error) {
      spinner.fail('Failed to link packages');
      throw error;
    }
  }

  /**
   * Run a shell command
   */
  private async runCommand(command: string, cwd: string): Promise<void> {
    const { execa } = await import('execa');

    try {
      const stdio = this.config.log?.quiet ? 'pipe' : 'inherit';
      await execa(command, {
        cwd,
        shell: true,
        stdio,
      });
    } catch (error) {
      throw new Error(`Command failed: ${command} - ${error}`);
    }
  }

  /**
   * Get paths to watch for changes
   */
  private getWatchPaths(): string[] {
    const paths: string[] = [];

    // Handle runtime API specs (e.g., FastAPI)
    const isRuntimeSpec =
      this.config.services.backend.apiSpec.path.startsWith('runtime:') ||
      this.config.services.backend.apiSpec.path.startsWith('/');

    if (isRuntimeSpec) {
      // For runtime specs, watch the entire backend directory
      // The ignore patterns will be handled by chokidar's ignored option
      paths.push(this.config.resolvedPaths.backend);
    } else {
      // Watch static API spec file
      const specPath = join(
        this.config.resolvedPaths.backend,
        this.config.services.backend.apiSpec.path
      );
      paths.push(specPath);
    }

    // Watch additional paths if specified
    if (this.config.services.backend.apiSpec.watch) {
      for (const pattern of this.config.services.backend.apiSpec.watch) {
        paths.push(join(this.config.resolvedPaths.backend, pattern));
      }
    }

    return paths;
  }

  /**
   * Check if file is relevant for synchronization
   */
  private isRelevantFile(filePath: string): boolean {
    // For runtime specs, any Python file change is relevant
    const isRuntimeSpec =
      this.config.services.backend.apiSpec.path.startsWith('runtime:') ||
      this.config.services.backend.apiSpec.path.startsWith('/');

    if (isRuntimeSpec) {
      // Check if it's a Python file and not in ignored directories
      if (
        filePath.endsWith('.py') &&
        !filePath.includes('__pycache__') &&
        !filePath.includes('.venv') &&
        !filePath.includes('venv/') &&
        !filePath.includes('env/')
      ) {
        return true;
      }
    }

    // Always relevant for API spec files
    return (
      filePath.endsWith('.json') ||
      filePath.endsWith('.yaml') ||
      filePath.endsWith('.yml')
    );
  }
}

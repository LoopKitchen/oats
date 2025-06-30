/**
 * OATS Development Sync Engine
 *
 * Optimized file watching and synchronization system
 *
 * @module @oatsjs/core/dev-sync-optimized
 */

import { EventEmitter } from 'events';
import { existsSync, readFileSync } from 'fs';
import { join, basename } from 'path';

import chalk from 'chalk';
import { watch } from 'chokidar';
import debounce from 'lodash.debounce';

import { ApiSpecError, GeneratorError } from '../errors/index.js';
import { PlatformUtils } from '../utils/platform.js';

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

  constructor(config: RuntimeConfig) {
    super();
    this.config = config;
    this.changeDetector = new SwaggerChangeDetector();

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
        console.log(chalk.blue('👁️  Starting OpenAPI spec polling...'));
      }

      const pollIntervalMs = this.config.sync.pollingInterval || 5000; // Default 5 seconds

      if (!this.config.log?.quiet) {
        console.log(chalk.dim(`📊 Polling interval: ${pollIntervalMs}ms`));
      }

      // Start polling
      this.pollingInterval = setInterval(() => {
        this.debouncedSync();
      }, pollIntervalMs);

      this.isRunning = true;

      if (!this.config.log?.quiet) {
        console.log(chalk.green('✅ OpenAPI spec polling started'));
      }
    } else {
      // For static specs, use file watching
      if (!this.config.log?.quiet) {
        console.log(chalk.blue('👁️  Starting file watcher...'));
      }

      try {
        const watchPaths = this.getWatchPaths();

        if (!this.config.log?.quiet) {
          console.log(chalk.dim('📂 Watching paths:'), watchPaths);
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
        console.log(chalk.green('✅ File watcher started'));
      } catch (error) {
        console.error(chalk.red('❌ Failed to start file watcher:'), error);
        throw error;
      }
    }

    // Run initial sync if configured
    if (this.config.sync.runInitialGeneration) {
      console.log(chalk.blue('🔄 Running initial sync...'));
      await this.performSync();
    }

    this.emit('started');
  }

  /**
   * Stop watching for changes
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log(chalk.yellow('🔄 Stopping sync engine...'));

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }

    this.isRunning = false;
    console.log(chalk.green('✅ Sync engine stopped'));
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
    console.log(chalk.gray(`📝 File changed: ${filePath}`));

    // Check if this is an API spec file or related file
    const isRelevant = this.isRelevantFile(filePath);
    console.log(chalk.dim(`   Is relevant: ${isRelevant}`));

    if (isRelevant) {
      console.log(
        chalk.blue('🔄 API-related file changed, scheduling sync...')
      );
      this.debouncedSync();
    } else {
      console.log(chalk.dim('   Ignoring non-relevant file'));
    }
  }

  /**
   * Handle watch errors
   */
  private handleWatchError(error: Error): void {
    console.error(chalk.red('👁️  File watcher error:'), error);
    this.emit('error', error);
  }

  /**
   * Perform synchronization
   */
  private async performSync(): Promise<void> {
    // Prevent concurrent sync operations
    if (this.syncLock) {
      console.log(chalk.yellow('⏳ Sync already in progress, skipping...'));
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

      console.log(chalk.blue('🔄 Synchronizing API changes...'));

      // Check if API spec has meaningful changes
      const checkStartTime = Date.now();
      const hasChanges = await this.checkForMeaningfulChanges();
      if (showDurations) {
        console.log(
          chalk.dim(`  ⏱️  Change detection: ${Date.now() - checkStartTime}ms`)
        );
      }

      if (!hasChanges && this.config.sync.strategy === 'smart') {
        console.log(chalk.gray('📊 No meaningful API changes detected'));
        return;
      }

      // Generate TypeScript client
      const genStartTime = Date.now();
      await this.generateClient();
      if (showDurations) {
        console.log(
          chalk.dim(`  ⏱️  Client generation: ${Date.now() - genStartTime}ms`)
        );
      }

      // Build client if needed
      if (this.config.services.client.buildCommand) {
        const buildStartTime = Date.now();
        await this.buildClient();
        if (showDurations) {
          console.log(
            chalk.dim(`  ⏱️  Client build: ${Date.now() - buildStartTime}ms`)
          );
        }
      }

      // Link packages if auto-link is enabled
      if (this.config.sync.autoLink) {
        const linkStartTime = Date.now();
        await this.linkPackages();
        if (showDurations) {
          console.log(
            chalk.dim(`  ⏱️  Package linking: ${Date.now() - linkStartTime}ms`)
          );
        }
      }

      this.lastSyncTime = new Date();
      this.syncRetries = 0; // Reset retry count on success

      if (showDurations) {
        const totalDuration = Date.now() - syncStartTime;
        console.log(
          chalk.green(
            `✅ Synchronization completed successfully (${totalDuration}ms total)`
          )
        );
      } else {
        console.log(chalk.green('✅ Synchronization completed successfully'));
      }

      const completedEvent: SyncEvent = {
        type: 'generation-completed',
        timestamp: new Date(),
      };
      this.emit('sync-event', completedEvent);
    } catch (error) {
      console.error(chalk.red('❌ Synchronization failed:'), error);

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
        console.log(
          chalk.yellow(
            `🔄 Retrying sync in ${retryDelay}ms (attempt ${this.syncRetries}/${this.MAX_SYNC_RETRIES})...`
          )
        );
        setTimeout(() => {
          this.syncLock = false;
          this.performSync();
        }, retryDelay);
      } else {
        console.error(
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
          console.warn(
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
        console.warn(
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
    console.log(chalk.blue('🏗️  Generating TypeScript client...'));
    const showDurations = this.config.sync.showStepDurations ?? false;

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
          console.log(
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

      console.log(chalk.dim(`Fetching OpenAPI spec from ${apiUrl}...`));

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
            console.log(
              chalk.dim(
                `    ⏱️  Fetched OpenAPI spec: ${Date.now() - attemptStartTime}ms`
              )
            );
          } else {
            console.log(
              chalk.dim('Fetched and saved OpenAPI spec from runtime')
            );
          }

          // Success - break out of retry loop
          break;
        } catch (error) {
          console.log(
            chalk.yellow(`Attempt ${attempt}/${maxRetries} failed: ${error}`)
          );

          if (attempt < maxRetries) {
            console.log(chalk.dim(`Waiting ${retryDelay}ms before retry...`));
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          } else {
            console.error(
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
        console.log(chalk.dim('Copied swagger.json to client directory'));
      } catch (error) {
        console.error(chalk.red('Failed to copy swagger.json:'), error);
      }
    }

    // Clean generated files before regeneration to avoid caching issues
    try {
      const cleanStartTime = Date.now();
      const srcPath = join(this.config.resolvedPaths.client, 'src');
      const { rmSync } = await import('fs');
      rmSync(srcPath, { recursive: true, force: true });

      if (showDurations) {
        console.log(
          chalk.dim(
            `    ⏱️  Cleaned generated files: ${Date.now() - cleanStartTime}ms`
          )
        );
      } else {
        console.log(chalk.dim('Cleaned generated files'));
      }
    } catch (err) {
      // Ignore errors, src directory might not exist
    }

    // Implementation depends on generator type
    const { generator, generateCommand } = this.config.services.client;
    const genCommandStartTime = Date.now();

    if (generateCommand) {
      // Use the specified generate command
      await this.runCommand(generateCommand, this.config.resolvedPaths.client);
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
      console.log(
        chalk.green(
          `✅ TypeScript client generated (${Date.now() - genCommandStartTime}ms)`
        )
      );
    } else {
      console.log(chalk.green('✅ TypeScript client generated'));
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
  }

  /**
   * Build client package
   */
  private async buildClient(): Promise<void> {
    const { buildCommand } = this.config.services.client;
    if (!buildCommand) return;

    console.log(chalk.blue('🔨 Building client package...'));

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
    await this.runCommand(commandToRun, this.config.resolvedPaths.client);
    console.log(chalk.green('✅ Client package built'));
  }

  /**
   * Link packages for local development
   */
  private async linkPackages(): Promise<void> {
    console.log(chalk.blue('🔗 Linking packages...'));

    const { linkCommand } = this.config.services.client;
    if (linkCommand) {
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
          console.log(chalk.dim('Triggered frontend HMR'));
        } catch (err) {
          // Ignore errors, this is optional
        }
      }
    }

    console.log(chalk.green('✅ Packages linked'));
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

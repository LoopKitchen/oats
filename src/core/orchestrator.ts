/**
 * OATS Development Orchestrator
 *
 * Manages multiple development services with cross-platform compatibility
 * and coordinates synchronization between backend API and TypeScript client
 */

import { EventEmitter } from 'events';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { watch } from 'chokidar';
import chalk from 'chalk';
import ora from 'ora';

import { ProcessManager } from '../utils/process-manager.js';
import { PortManager } from '../utils/port-manager.js';
import { Logger } from '../utils/logger.js';
import { DebugManager } from '../utils/debug.js';
import { ShutdownManager } from '../utils/shutdown-manager.js';

import { DevSyncEngine } from './dev-sync-optimized.js';
import { BaseService, ServiceState } from './services/base-service.js';
import { envManager } from './services/env-manager.js';

import type { RuntimeConfig } from '../types/config.types.js';

// Service implementations
class BackendService extends BaseService {
  protected async waitForReady(): Promise<void> {
    if (!this.config.port) return;

    const maxAttempts = 30;
    const checkInterval = 1000;
    const spinner = ora(
      `Waiting for backend service on port ${this.config.port}...`
    ).start();

    try {
      for (let i = 0; i < maxAttempts; i++) {
        const isReady = await PortManager.isPortInUse(this.config.port);
        if (isReady) {
          spinner.succeed(`Backend service ready on port ${this.config.port}`);
          this.logger.debug(
            `Backend service ready on port ${this.config.port}`
          );
          return;
        }
        spinner.text = `Waiting for backend service on port ${this.config.port}... (${i + 1}/${maxAttempts})`;
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      }

      spinner.fail(
        `Backend service did not start within ${maxAttempts} seconds`
      );
      throw new Error(
        `Backend service failed to start on port ${this.config.port}`
      );
    } catch (error) {
      spinner.fail('Failed to start backend service');
      throw error;
    }
  }

  protected async checkPort(): Promise<void> {
    if (!this.config.port) return;

    const autoKill = this.config.env?.['OATS_AUTO_KILL_PORTS'] !== 'false';
    if (autoKill) {
      await PortManager.freePort(this.config.port, this.config.name);
    }
  }
}

class ClientService extends BaseService {
  protected async waitForReady(): Promise<void> {
    // Client generation is typically quick
    const spinner = ora('Initializing client service...').start();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    spinner.succeed('Client service ready');
  }
}

class FrontendService extends BaseService {
  /**
   * Override start to inject OATS environment variables
   */
  async start(): Promise<void> {
    // Generate and merge OATS env vars
    const oatsEnvVars = envManager.generateFrontendEnvVars(
      this.config.path,
      this.runtimeConfig
    );

    // Merge with existing env config
    this.config.env = {
      ...this.config.env,
      ...oatsEnvVars,
    };

    // Call parent start method
    await super.start();
  }

  protected async waitForReady(): Promise<void> {
    if (!this.config.port) return;

    const maxAttempts = 60; // Frontend can take longer
    const checkInterval = 1000;
    const spinner = ora(
      `Waiting for frontend service on port ${this.config.port}...`
    ).start();

    try {
      for (let i = 0; i < maxAttempts; i++) {
        const isReady = await PortManager.isPortInUse(this.config.port);
        if (isReady) {
          spinner.succeed(`Frontend service ready on port ${this.config.port}`);
          this.logger.debug(
            `Frontend service ready on port ${this.config.port}`
          );
          return;
        }
        spinner.text = `Waiting for frontend service on port ${this.config.port}... (${i + 1}/${maxAttempts})`;
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      }

      spinner.fail(
        `Frontend service did not start within ${maxAttempts} seconds`
      );
      throw new Error(
        `Frontend service failed to start on port ${this.config.port}`
      );
    } catch (error) {
      spinner.fail('Failed to start frontend service');
      throw error;
    }
  }

  protected async checkPort(): Promise<void> {
    if (!this.config.port) return;

    const autoKill = this.config.env?.['OATS_AUTO_KILL_PORTS'] !== 'false';
    if (autoKill) {
      await PortManager.freePort(this.config.port, this.config.name);
    }
  }
}

interface LinkedPackageInfo {
  frontendPath: string;
  frontendPackageManager: string;
  clientPath: string;
  clientPackageManager: string;
  globalLinked: boolean;
}

export class DevSyncOrchestrator extends EventEmitter {
  private config: RuntimeConfig;
  private logger: Logger;
  private processManager: ProcessManager;
  private shutdownManager: ShutdownManager;
  private services: Map<string, BaseService> = new Map();
  private syncEngine?: DevSyncEngine;
  private linkedPackages: Map<string, LinkedPackageInfo> = new Map();
  private configWatcher?: any;

  constructor(config: RuntimeConfig) {
    super();
    this.config = config;
    this.logger = new Logger('Orchestrator');
    this.processManager = new ProcessManager();
    this.shutdownManager = ShutdownManager.getInstance();

    // Initialize logging
    const logLevel = config.log?.level || 'info';
    Logger.setLogLevel(logLevel as any);
    Logger.setShowTimestamps(config.log?.timestamps ?? false);
    Logger.setUseColors(config.log?.colors ?? true);

    // Initialize debug mode
    DebugManager.init(logLevel === 'debug');

    // Set log file if configured (only for debug level)
    if (config.log?.file && logLevel === 'debug') {
      Logger.setLogFile(config.log.file);
    }

    this.setupSignalHandlers();
    this.createServices();
  }

  /**
   * Create service instances
   */
  private createServices(): void {
    // Backend service
    const backendService = new BackendService(
      {
        name: 'backend',
        path: this.config.resolvedPaths.backend,
        command: this.config.services.backend.startCommand,
        port: this.config.services.backend.port,
        env: this.config.services.backend.env,
      },
      this.processManager,
      this.config
    );
    this.services.set('backend', backendService);

    // Client service
    const clientService = new ClientService(
      {
        name: 'client',
        path: this.config.resolvedPaths.client,
        command:
          this.config.services.client.generateCommand || 'npm run generate',
        env: this.config.services.client.env || {},
      },
      this.processManager,
      this.config
    );
    this.services.set('client', clientService);

    // Frontend service (optional)
    if (this.config.services.frontend) {
      const frontendService = new FrontendService(
        {
          name: 'frontend',
          path: this.config.resolvedPaths.frontend!,
          command: this.config.services.frontend.startCommand,
          port: this.config.services.frontend.port,
          env: this.config.services.frontend.env,
        },
        this.processManager,
        this.config
      );
      this.services.set('frontend', frontendService);
    }

    // Set up service event handlers
    this.services.forEach((service, name) => {
      service.on('stateChange', ({ newState }) => {
        this.emit('serviceStateChange', { service: name, state: newState });
      });
    });
  }

  /**
   * Start all services
   */
  async start(): Promise<void> {
    this.logger.info(
      chalk.blue.bold('\n🚀 Starting OATS Development Sync...\n')
    );

    try {
      // Link client package first
      await this.linkClientPackage();

      // Start backend service
      DebugManager.section('Starting Backend Service');
      const backendService = this.services.get('backend')!;
      await backendService.start();

      // Start client service (watch mode)
      DebugManager.section('Starting Client Service');
      const clientService = this.services.get('client')!;
      await clientService.start();

      // Start frontend service if configured
      if (this.services.has('frontend')) {
        DebugManager.section('Starting Frontend Service');
        const frontendService = this.services.get('frontend')!;
        await frontendService.start();
      }

      // Start sync engine
      DebugManager.section('Starting Sync Engine');
      this.syncEngine = new DevSyncEngine(this.config, this.processManager);
      this.setupSyncHandlers();
      await this.syncEngine.start();

      // Show success message for info level and above
      this.logger.info(
        chalk.green.bold('\n✅ All services started successfully!\n')
      );
      this.printServiceStatus();

      // Set up signal handlers for graceful shutdown
      this.setupSignalHandlers();

      // Watch config file for changes
      this.watchConfigFile();
    } catch (error) {
      console.error(chalk.red.bold('\n❌ Failed to start services\n'));
      // Only shutdown if this is the initial start, not a config reload
      if (!this.configWatcher) {
        await this.shutdown();
      }
      throw error;
    }
  }

  /**
   * Shutdown all services
   */
  async shutdown(): Promise<void> {
    await this.shutdownManager.shutdown({
      syncEngine: this.syncEngine,
      services: this.services,
      processManager: this.processManager,
      configWatcher: this.configWatcher,
      unlinkPackages: this.unlinkPackages.bind(this),
    });
  }

  /**
   * Stop all services without exiting the process
   */
  private async stop(keepConfigWatcher = false): Promise<void> {
    await this.shutdownManager.shutdown(
      {
        syncEngine: this.syncEngine,
        services: this.services,
        processManager: this.processManager,
        configWatcher: this.configWatcher,
        unlinkPackages: this.unlinkPackages.bind(this),
      },
      {
        keepConfigWatcher,
        exitProcess: false,
      }
    );

    // Clear service references after shutdown
    this.syncEngine = undefined;
    if (!keepConfigWatcher) {
      this.configWatcher = undefined;
    }
  }

  /**
   * Link client package to frontend
   */
  private async linkClientPackage(): Promise<void> {
    if (!this.config.services.frontend) return;

    const clientPath = this.config.resolvedPaths.client;
    const clientName = this.config.services.client.packageName;
    const frontendPath = this.config.resolvedPaths.frontend!;

    const frontendPackageManager = this.detectPackageManager(frontendPath);
    const clientPackageManager = this.detectPackageManager(clientPath);
    const fingerprint = this.getClientPackageFingerprint(clientPath);
    const cachePath = join(clientPath, '.oats-link-cache.json');
    let shouldCreateGlobalLink = true;
    let globalLinkedThisSession = false;

    if (fingerprint) {
      if (existsSync(cachePath)) {
        try {
          const cached = JSON.parse(readFileSync(cachePath, 'utf-8')) as {
            hash?: string;
            packageManager?: string;
            frontendPath?: string;
          };

          if (
            cached.hash === fingerprint &&
            cached.packageManager === frontendPackageManager &&
            cached.frontendPath === frontendPath
          ) {
            shouldCreateGlobalLink = false;
          }
        } catch (error) {
          this.logger.debug(
            'Failed to read link cache, falling back to fresh link:',
            error
          );
        }
      }
    }

    const spinner = ora(`Linking ${clientName} to frontend...`).start();

    try {
      if (shouldCreateGlobalLink) {
        spinner.text = `Creating ${clientPackageManager} link for ${clientName}...`;
        await this.runCommand(`${clientPackageManager} link`, clientPath);
        globalLinkedThisSession = true;

        if (fingerprint) {
          this.writeLinkCache(cachePath, {
            hash: fingerprint,
            packageManager: frontendPackageManager,
            frontendPath,
          });
        }
      } else {
        spinner.text = `Using cached ${frontendPackageManager} link for ${clientName}...`;
        globalLinkedThisSession = true;
      }

      // Link to frontend
      spinner.text = `Linking ${clientName} to frontend project...`;
      try {
        await this.runCommand(
          `${frontendPackageManager} link ${clientName}`,
          frontendPath
        );
      } catch (error) {
        if (!shouldCreateGlobalLink) {
          this.logger.warn(
            `Cached link failed; refreshing global link for ${clientName}`
          );
          spinner.text = `Refreshing ${clientPackageManager} link for ${clientName}...`;
          await this.runCommand(`${clientPackageManager} link`, clientPath);
          globalLinkedThisSession = true;

          if (fingerprint) {
            this.writeLinkCache(cachePath, {
              hash: fingerprint,
              packageManager: frontendPackageManager,
              frontendPath,
            });
          }

          spinner.text = `Linking ${clientName} to frontend project...`;
          await this.runCommand(
            `${frontendPackageManager} link ${clientName}`,
            frontendPath
          );
        } else {
          throw error;
        }
      }

      this.linkedPackages.set(clientName, {
        frontendPath,
        frontendPackageManager,
        clientPath,
        clientPackageManager,
        globalLinked: globalLinkedThisSession,
      });

      spinner.succeed(`Linked ${clientName} to frontend`);
    } catch (error) {
      spinner.fail(`Failed to link ${clientName}`);
      throw error;
    }
  }

  /**
   * Unlink packages on shutdown
   */
  private async unlinkPackages(): Promise<void> {
    for (const [packageName, info] of this.linkedPackages) {
      try {
        if (info.frontendPath) {
          await this.runCommand(
            `${info.frontendPackageManager} unlink ${packageName}`,
            info.frontendPath
          );
          console.log(
            chalk.dim(
              `🔗 Removed ${packageName} link from frontend (${info.frontendPackageManager})`
            )
          );
        }

        if (info.globalLinked) {
          const unlinkCommand = this.getGlobalUnlinkCommand(
            info.clientPackageManager,
            packageName
          );
          if (unlinkCommand) {
            await this.runCommand(unlinkCommand, info.clientPath);
            console.log(
              chalk.dim(
                `🔗 Removed global link for ${packageName} (${info.clientPackageManager})`
              )
            );
          }
        }
      } catch (err) {
        // Ignore unlink errors
      }
    }
    this.linkedPackages.clear();
  }

  /**
   * Detect package manager
   */
  private detectPackageManager(projectPath: string): string {
    if (existsSync(join(projectPath, 'yarn.lock'))) return 'yarn';
    if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm';
    return 'npm';
  }

  /**
   * Calculate a fingerprint for the client package to detect changes
   */
  private getClientPackageFingerprint(clientPath: string): string | null {
    try {
      const hash = createHash('sha256');
      const packageJsonPath = join(clientPath, 'package.json');

      if (!existsSync(packageJsonPath)) {
        return null;
      }

      hash.update(readFileSync(packageJsonPath, 'utf-8'));

      const lockFiles = ['yarn.lock', 'package-lock.json', 'pnpm-lock.yaml'];
      for (const lockFile of lockFiles) {
        const lockPath = join(clientPath, lockFile);
        if (existsSync(lockPath)) {
          hash.update(readFileSync(lockPath, 'utf-8'));
        }
      }

      return hash.digest('hex');
    } catch (error) {
      this.logger.debug(
        `Failed to fingerprint client package at ${clientPath}:`,
        error
      );
      return null;
    }
  }

  /**
   * Persist link cache metadata to speed up subsequent startups
   */
  private writeLinkCache(
    cachePath: string,
    data: {
      hash: string;
      packageManager: string;
      frontendPath: string;
    }
  ): void {
    try {
      writeFileSync(
        cachePath,
        `${JSON.stringify(
          {
            ...data,
            updatedAt: new Date().toISOString(),
          },
          null,
          2
        )}\n`
      );
    } catch (error) {
      this.logger.debug('Failed to write link cache file:', error);
    }
  }

  /**
   * Determine the appropriate command to remove global links
   */
  private getGlobalUnlinkCommand(
    packageManager: string,
    packageName: string
  ): string | null {
    switch (packageManager) {
      case 'yarn':
        return 'yarn unlink';
      case 'npm':
        return 'npm unlink';
      case 'pnpm':
        return `pnpm unlink --global ${packageName}`;
      default:
        return null;
    }
  }

  /**
   * Run a command
   */
  private async runCommand(command: string, cwd?: string): Promise<void> {
    const [cmd, ...args] = command.split(' ');
    const child = this.processManager.startProcess(cmd || 'echo', args, {
      cwd: cwd || process.cwd(),
    });

    // Wait for the command to complete
    await new Promise<void>((resolve, reject) => {
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with exit code ${code}`));
        }
      });
      child.on('error', reject);
    });
  }

  /**
   * Set up sync engine event handlers
   */
  private setupSyncHandlers(): void {
    if (!this.syncEngine) return;

    this.syncEngine.on('generation-completed', ({ linkedPaths }) => {
      ora().succeed('Client regeneration completed');
      if (linkedPaths?.length) {
        console.log(chalk.dim('Updated paths:'));
        linkedPaths.forEach((path: string) =>
          console.log(chalk.dim(`  - ${path}`))
        );
      }
    });

    this.syncEngine.on('generation-failed', ({ error }) => {
      console.error(chalk.red('❌ Client regeneration failed:'), error);
    });
  }

  /**
   * Set up signal handlers
   */
  private setupSignalHandlers(): void {
    this.shutdownManager.setupSignalHandlers(() => this.shutdown());
  }

  /**
   * Watch config file for changes
   */
  private watchConfigFile(): void {
    // If config watcher already exists, don't create a new one
    if (this.configWatcher) {
      return;
    }

    // Watch all possible config files
    const configPatterns = [
      'oats.config.json',
      'oats.config.js',
      'oats.config.ts',
    ];

    this.configWatcher = watch(configPatterns, {
      persistent: true,
      ignoreInitial: true,
    });

    this.configWatcher.on('change', async (_changedPath: string) => {
      console.log(chalk.yellow('\n🔄 Configuration changed, restarting...\n'));

      try {
        // Stop all services but keep the config watcher for restart
        await this.stop(true);

        // Re-read and validate the configuration using the config loader
        const { loadConfigFromFile, findConfigFile } = await import(
          '../config/loader.js'
        );
        const { validateConfig, mergeWithDefaults } = await import(
          '../config/schema.js'
        );
        const { dirname, resolve, join } = await import('path');

        // Find the config file (it might be a different one than originally loaded)
        const configPath = findConfigFile();
        if (!configPath) {
          console.error(chalk.red('❌ Could not find configuration file'));
          return;
        }

        // Load the new configuration
        const loadedConfig = await loadConfigFromFile(configPath);

        // Validate configuration
        const validation = validateConfig(loadedConfig);
        if (!validation.valid) {
          console.error(chalk.red('\n❌ Configuration validation failed:\n'));
          validation.errors.forEach((error) => {
            console.error(chalk.red(`  • ${error.path}: ${error.message}`));
          });
          console.log(
            chalk.yellow('\nPlease fix these errors in the config file.')
          );
          return;
        }

        // Merge with defaults
        const newConfig = mergeWithDefaults(loadedConfig);

        // Create runtime config with resolved paths
        const runtimeConfig = newConfig as any;
        runtimeConfig.resolvedPaths = {
          backend: resolve(
            dirname(configPath),
            runtimeConfig.services.backend.path
          ),
          client: resolve(
            dirname(configPath),
            runtimeConfig.services.client.path
          ),
          frontend: runtimeConfig.services.frontend
            ? resolve(dirname(configPath), runtimeConfig.services.frontend.path)
            : undefined,
          apiSpec: runtimeConfig.services.backend.apiSpec.path.startsWith(
            'runtime:'
          )
            ? runtimeConfig.services.backend.apiSpec.path
            : join(
                resolve(
                  dirname(configPath),
                  runtimeConfig.services.backend.path
                ),
                runtimeConfig.services.backend.apiSpec.path
              ),
        };

        // Update the config
        this.config = runtimeConfig;

        // Recreate services with new config
        this.services.clear();
        this.createServices();

        // Restart everything
        try {
          await this.start();
        } catch (startError) {
          // Don't call shutdown() here as it will exit the process
          // Instead, log the error and keep the orchestrator running
          console.error(
            chalk.red('❌ Failed to restart after config change:'),
            startError
          );
          console.log(
            chalk.yellow(
              '\nServices are stopped. Fix the issue and save the config to retry.'
            )
          );

          // Keep watching for config changes so user can fix and retry
          return;
        }
      } catch (error) {
        console.error(
          chalk.red('❌ Failed to restart after config change:'),
          error
        );
        console.log(
          chalk.yellow(
            '\nServices are stopped. Fix the issue and save the config to retry.'
          )
        );
      }
    });
  }

  /**
   * Print service status
   */
  private printServiceStatus(): void {
    console.log(chalk.blue('\n📊 Service Status:'));

    this.services.forEach((service) => {
      const info = service.getInfo();
      const stateColor =
        info.state === ServiceState.RUNNING ? 'green' : 'yellow';
      const portInfo = info.port ? ` (port ${info.port})` : '';

      console.log(
        chalk[stateColor](`  ${info.name}: ${info.state}${portInfo}`)
      );
    });

    console.log('');
  }
}

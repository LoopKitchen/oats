/**
 * OATS Development Orchestrator
 *
 * Manages multiple development services with cross-platform compatibility
 * and coordinates synchronization between backend API and TypeScript client
 */

import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import { join } from 'path';
import { watch } from 'chokidar';
import chalk from 'chalk';

import { ProcessManager } from '../utils/process-manager.js';
import { PortManager } from '../utils/port-manager.js';
import { Logger } from '../utils/logger.js';
import { DebugManager } from '../utils/debug.js';

import { DevSyncEngine } from './dev-sync-optimized.js';
import { BaseService, ServiceState } from './services/base-service.js';

import type { RuntimeConfig } from '../types/config.types.js';

// Service implementations
class BackendService extends BaseService {
  protected async waitForReady(): Promise<void> {
    if (!this.config.port) return;

    const maxAttempts = 30;
    const checkInterval = 1000;

    for (let i = 0; i < maxAttempts; i++) {
      const isReady = await PortManager.isPortInUse(this.config.port);
      if (isReady) {
        this.logger.debug(`Backend service ready on port ${this.config.port}`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    throw new Error(
      `Backend service failed to start on port ${this.config.port}`
    );
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
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

class FrontendService extends BaseService {
  protected async waitForReady(): Promise<void> {
    if (!this.config.port) return;

    const maxAttempts = 60; // Frontend can take longer
    const checkInterval = 1000;

    for (let i = 0; i < maxAttempts; i++) {
      const isReady = await PortManager.isPortInUse(this.config.port);
      if (isReady) {
        this.logger.debug(`Frontend service ready on port ${this.config.port}`);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    throw new Error(
      `Frontend service failed to start on port ${this.config.port}`
    );
  }

  protected async checkPort(): Promise<void> {
    if (!this.config.port) return;

    const autoKill = this.config.env?.['OATS_AUTO_KILL_PORTS'] !== 'false';
    if (autoKill) {
      await PortManager.freePort(this.config.port, this.config.name);
    }
  }
}

export class DevSyncOrchestrator extends EventEmitter {
  private config: RuntimeConfig;
  private logger: Logger;
  private processManager: ProcessManager;
  private services: Map<string, BaseService> = new Map();
  private syncEngine?: DevSyncEngine;
  private isShuttingDown = false;
  private linkedPackages: Set<string> = new Set();
  private configWatcher?: any;

  constructor(config: RuntimeConfig) {
    super();
    this.config = config;
    this.logger = new Logger('Orchestrator');
    this.processManager = new ProcessManager();

    // Initialize debug mode and logging
    DebugManager.init(config.log?.level === 'debug');

    // Set log file if configured
    if (config.log?.file) {
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
    console.log(chalk.blue.bold('\n🚀 Starting OATS Development Sync...\n'));

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
      this.syncEngine = new DevSyncEngine(this.config);
      this.setupSyncHandlers();
      await this.syncEngine.start();

      // Only show success message if not in quiet mode
      if (!this.config.log?.quiet) {
        console.log(
          chalk.green.bold('\n✅ All services started successfully!\n')
        );
        this.printServiceStatus();
      }

      // Watch config file for changes
      this.watchConfigFile();
    } catch (error) {
      console.error(chalk.red.bold('\n❌ Failed to start services\n'));
      await this.shutdown();
      throw error;
    }
  }

  /**
   * Shutdown all services
   */
  async shutdown(): Promise<void> {
    await this.stop();
    process.exit(0);
  }

  /**
   * Stop all services without exiting the process
   */
  private async stop(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    if (!this.config.log?.quiet) {
      console.log(chalk.yellow.bold('\n🛑 Shutting down services...\n'));
    }

    // Stop sync engine
    if (this.syncEngine) {
      this.syncEngine.stop();
      this.syncEngine = undefined;
    }

    // Stop all services
    const stopPromises = Array.from(this.services.values()).map((service) =>
      service
        .stop()
        .catch((err) =>
          this.logger.error(`Failed to stop ${service.getInfo().name}:`, err)
        )
    );
    await Promise.all(stopPromises);

    // Kill any remaining processes
    await this.processManager.killAll();

    // Unlink packages
    await this.unlinkPackages();

    // Stop config watcher
    if (this.configWatcher) {
      await this.configWatcher.close();
      this.configWatcher = undefined;
    }

    if (!this.config.log?.quiet) {
      console.log(chalk.green.bold('\n✅ Shutdown complete\n'));
    }

    // Reset shutdown flag for potential restart
    this.isShuttingDown = false;
  }

  /**
   * Link client package to frontend
   */
  private async linkClientPackage(): Promise<void> {
    if (!this.config.services.frontend) return;

    const clientPath = this.config.resolvedPaths.client;
    const clientName = this.config.services.client.packageName;
    const frontendPath = this.config.resolvedPaths.frontend!;

    const pm = this.detectPackageManager(frontendPath);

    // Link in client directory
    await this.runCommand(`${pm} link`, clientPath);
    this.linkedPackages.add(clientName);

    // Link to frontend
    await this.runCommand(`${pm} link ${clientName}`, frontendPath);

    if (!this.config.log?.quiet) {
      console.log(chalk.green(`✅ Linked ${clientName} to frontend`));
    }
  }

  /**
   * Unlink packages on shutdown
   */
  private async unlinkPackages(): Promise<void> {
    for (const packageName of this.linkedPackages) {
      try {
        if (this.config.resolvedPaths.frontend) {
          const pm = this.detectPackageManager(
            this.config.resolvedPaths.frontend
          );
          await this.runCommand(
            `${pm} unlink ${packageName}`,
            this.config.resolvedPaths.frontend
          );
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
      console.log(chalk.green('✅ Client regeneration completed'));
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
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

    signals.forEach((signal) => {
      process.on(signal, async () => {
        console.log(chalk.yellow(`\n📍 Received ${signal}`));
        await this.shutdown();
      });
    });

    process.on('uncaughtException', async (error) => {
      console.error(chalk.red('\n❌ Uncaught exception:'), error);
      await this.shutdown();
    });
  }

  /**
   * Watch config file for changes
   */
  private watchConfigFile(): void {
    const configPath = 'oats.config.json';

    this.configWatcher = watch(configPath, {
      persistent: true,
      ignoreInitial: true,
    });

    this.configWatcher.on('change', async () => {
      console.log(chalk.yellow('\n🔄 Configuration changed, restarting...\n'));

      try {
        // Stop all services but don't exit the process
        await this.stop();

        // Re-read and validate the configuration
        const { readFileSync } = await import('fs');
        const { validateConfig, mergeWithDefaults } = await import(
          '../config/schema.js'
        );
        const { dirname, resolve, join } = await import('path');

        const fullPath = resolve(configPath);
        const configContent = readFileSync(fullPath, 'utf-8');
        const newConfig = JSON.parse(configContent);

        // Validate configuration
        const validation = validateConfig(newConfig);
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

        // Create runtime config with resolved paths
        const runtimeConfig = mergeWithDefaults(newConfig) as any;
        runtimeConfig.resolvedPaths = {
          backend: resolve(
            dirname(fullPath),
            runtimeConfig.services.backend.path
          ),
          client: resolve(
            dirname(fullPath),
            runtimeConfig.services.client.path
          ),
          frontend: runtimeConfig.services.frontend
            ? resolve(dirname(fullPath), runtimeConfig.services.frontend.path)
            : undefined,
          apiSpec: join(
            resolve(dirname(fullPath), runtimeConfig.services.backend.path),
            runtimeConfig.services.backend.apiSpec.path
          ),
        };

        // Update the config
        this.config = runtimeConfig;

        // Recreate services with new config
        this.services.clear();
        this.createServices();

        // Restart everything
        await this.start();
      } catch (error) {
        console.error(
          chalk.red('❌ Failed to restart after config change:'),
          error
        );
        console.log(chalk.yellow('Please restart OATS manually.'));
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

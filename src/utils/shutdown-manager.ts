/**
 * Centralized shutdown management for OATS
 *
 * Handles graceful shutdown of all services and cleanup operations
 *
 * @module @oatsjs/utils/shutdown-manager
 */

import chalk from 'chalk';
import { Logger } from './logger.js';
import type { BaseService } from '../core/services/base-service.js';
import type { DevSyncEngine } from '../core/dev-sync-optimized.js';
import type { ProcessManager } from './process-manager.js';
import type { FSWatcher } from 'chokidar';

export interface ShutdownOptions {
  keepConfigWatcher?: boolean;
  exitProcess?: boolean;
}

export class ShutdownManager {
  private static instance: ShutdownManager;
  private logger: Logger;
  private isShuttingDown = false;
  private shutdownHandlers: Array<() => Promise<void>> = [];
  private signalHandlersSetup = false;

  private constructor() {
    this.logger = new Logger('ShutdownManager');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ShutdownManager {
    if (!ShutdownManager.instance) {
      ShutdownManager.instance = new ShutdownManager();
    }
    return ShutdownManager.instance;
  }

  /**
   * Register a custom shutdown handler
   */
  public registerHandler(handler: () => Promise<void>): void {
    this.shutdownHandlers.push(handler);
  }

  /**
   * Perform graceful shutdown of all services
   */
  public async shutdown(
    services: {
      syncEngine?: DevSyncEngine;
      services: Map<string, BaseService>;
      processManager: ProcessManager;
      configWatcher?: FSWatcher;
      unlinkPackages?: () => Promise<void>;
    },
    options: ShutdownOptions = {}
  ): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    const { keepConfigWatcher = false, exitProcess = true } = options;

    console.log(chalk.yellow.bold('\n🛑 Shutting down services...\n'));

    try {
      const shutdownTasks: Promise<void>[] = [];

      // Stop sync engine
      if (services.syncEngine) {
        shutdownTasks.push(
          services.syncEngine.stop().catch((err) => {
            this.logger.error('Failed to stop sync engine:', err);
          })
        );
      }

      // Stop all services
      shutdownTasks.push(
        ...Array.from(services.services.values()).map(async (service) => {
          try {
            await service.stop();
          } catch (err) {
            const serviceName = service.getInfo().name;
            this.logger.error(`Failed to stop ${serviceName}:`, err);
          }
        })
      );

      await Promise.all(shutdownTasks);

      // Kill any remaining processes
      await services.processManager.killAll();

      // Unlink packages
      if (services.unlinkPackages) {
        await services.unlinkPackages();
      }

      // Run custom shutdown handlers
      for (const handler of this.shutdownHandlers) {
        try {
          await handler();
        } catch (err) {
          this.logger.error('Shutdown handler failed:', err);
        }
      }

      // Stop config watcher if requested
      if (!keepConfigWatcher && services.configWatcher) {
        await services.configWatcher.close();
      }

      console.log(chalk.green.bold('\n✅ Shutdown complete\n'));

      if (exitProcess) {
        process.exit(0);
      }
    } catch (error) {
      this.logger.error('Shutdown failed:', error);
      if (exitProcess) {
        process.exit(1);
      }
      throw error;
    } finally {
      this.isShuttingDown = false;
    }
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  public setupSignalHandlers(shutdownCallback: () => Promise<void>): void {
    // Only set up handlers once
    if (this.signalHandlersSetup) {
      return;
    }
    this.signalHandlersSetup = true;

    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

    signals.forEach((signal) => {
      process.on(signal, async () => {
        // Prevent duplicate handling
        if (this.isShuttingDown) {
          return;
        }

        console.log(chalk.yellow(`\n📍 Received ${signal}`));

        // Ensure logs appear before terminal prompt
        process.stderr.write('');
        process.stdout.write('');

        try {
          await shutdownCallback();
        } catch (err) {
          console.error(chalk.red('Shutdown error:'), err);
          process.exit(1);
        }
      });
    });

    process.on('uncaughtException', (error) => {
      console.error(chalk.red('\n❌ Uncaught exception:'), error);

      // Ensure logs appear before terminal prompt
      process.stderr.write('');
      process.stdout.write('');

      shutdownCallback()
        .then(() => {
          // Exit is handled by shutdown method
        })
        .catch((err) => {
          console.error(chalk.red('Shutdown error:'), err);
          process.exit(1);
        });
    });
  }

  /**
   * Check if shutdown is in progress
   */
  public isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }
}

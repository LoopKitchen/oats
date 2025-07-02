import { EventEmitter } from 'events';
import { ExecaChildProcess } from 'execa';
import chalk from 'chalk';
import ora from 'ora';

import { ProcessManager } from '../../utils/process-manager.js';
import { Logger } from '../../utils/logger.js';
import { ServiceStartError } from '../../errors/index.js';
import { ShutdownManager } from '../../utils/shutdown-manager.js';

export interface ServiceConfig {
  name: string;
  path: string;
  command: string;
  port?: number;
  env?: Record<string, string>;
}

export enum ServiceState {
  STOPPED = 'stopped',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  ERROR = 'error',
}

export abstract class BaseService extends EventEmitter {
  protected config: ServiceConfig;
  protected logger: Logger;
  protected processManager: ProcessManager;
  protected process?: ExecaChildProcess;
  protected state: ServiceState = ServiceState.STOPPED;
  protected startTime?: Date;
  protected error?: Error;
  protected runtimeConfig?: any;

  constructor(
    config: ServiceConfig,
    processManager: ProcessManager,
    runtimeConfig?: any
  ) {
    super();
    this.config = config;
    this.logger = new Logger(config.name);
    this.processManager = processManager;
    this.runtimeConfig = runtimeConfig;
  }

  /**
   * Get the current service state
   */
  getState(): ServiceState {
    return this.state;
  }

  /**
   * Get service info
   */
  getInfo() {
    return {
      name: this.config.name,
      state: this.state,
      port: this.config.port,
      startTime: this.startTime,
      error: this.error,
      pid: this.process?.pid,
    };
  }

  /**
   * Start the service
   */
  async start(): Promise<void> {
    if (this.state !== ServiceState.STOPPED) {
      this.logger.warn(`Service already ${this.state}, cannot start`);
      return;
    }

    this.setState(ServiceState.STARTING);
    this.error = undefined;

    try {
      if (!this.runtimeConfig?.log?.quiet) {
        console.log(chalk.blue(`🚀 Starting ${this.config.name} service...`));
      }

      // Port conflict check (if applicable)
      if (this.config.port) {
        await this.checkPort();
      }

      // Start the process
      const { command, args } = this.parseCommand();
      this.process = this.processManager.startProcess(command, args, {
        cwd: this.config.path,
        env: this.config.env,
      });

      // Set up process event handlers
      this.setupProcessHandlers();

      // Wait for service to be ready
      await this.waitForReady();

      this.startTime = new Date();
      this.setState(ServiceState.RUNNING);
      if (!this.runtimeConfig?.log?.quiet) {
        ora().succeed(`${this.config.name} service started`);
      }
    } catch (error: any) {
      this.error = error;
      this.setState(ServiceState.ERROR);
      throw new ServiceStartError(
        this.config.name,
        error.message,
        this.process?.exitCode ?? -1
      );
    }
  }

  /**
   * Stop the service
   */
  async stop(): Promise<void> {
    if (this.state === ServiceState.STOPPED) {
      return;
    }

    this.setState(ServiceState.STOPPING);
    if (!this.runtimeConfig?.log?.quiet) {
      console.log(chalk.yellow(`🛑 Stopping ${this.config.name} service...`));
    }

    if (this.process) {
      await this.processManager.killProcess(this.process);
      this.process = undefined;
    }

    this.setState(ServiceState.STOPPED);

    if (!this.runtimeConfig?.log?.quiet) {
      ora().succeed(`${this.config.name} service stopped`);
    }
  }

  /**
   * Parse command string into command and args
   */
  protected parseCommand(): { command: string; args: string[] } {
    const parts = this.config.command.split(' ');
    return {
      command: parts[0] || '',
      args: parts.slice(1),
    };
  }

  /**
   * Set up process event handlers
   */
  protected setupProcessHandlers(): void {
    if (!this.process) return;

    this.process.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      if (!output) return;
      
      this.handleOutput(output);

      // Show service output based on log level and showServiceOutput setting
      const logLevel = this.runtimeConfig?.log?.level || 'info';
      const showServiceOutput =
        this.runtimeConfig?.log?.showServiceOutput !== false;

      // Only show service output in debug mode or if explicitly enabled in info mode
      // Don't show output during shutdown
      const shutdownManager = ShutdownManager.getInstance();
      if (showServiceOutput && (logLevel === 'debug' || logLevel === 'info') && !shutdownManager.isShutdownInProgress()) {
        console.log(chalk.gray(`[${this.config.name}] ${output}`));
      }
    });

    this.process.stderr?.on('data', (data) => {
      const output = data.toString();
      this.handleError(output);

      // Show errors based on log level
      const logLevel = this.runtimeConfig?.log?.level || 'info';
      const shutdownManager = ShutdownManager.getInstance();
      // Always show errors unless log level is set higher than error or during shutdown
      if (logLevel !== 'none' && !shutdownManager.isShutdownInProgress()) {
        console.error(chalk.red(`[${this.config.name}] ${output}`));
      }
    });

    this.process.on('exit', (code) => {
      // Don't show exit messages during shutdown
      if (this.state === ServiceState.STOPPING) {
        return;
      }
      
      if (this.state === ServiceState.RUNNING) {
        this.error = new Error(`Process exited unexpectedly with code ${code}`);
        this.setState(ServiceState.ERROR);
      }
    });
  }

  /**
   * Set the service state and emit event
   */
  protected setState(state: ServiceState): void {
    const oldState = this.state;
    this.state = state;
    this.emit('stateChange', { oldState, newState: state });
  }

  /**
   * Handle process output (override in subclasses)
   */
  protected handleOutput(_output: string): void {
    // Override in subclasses to detect when service is ready
  }

  /**
   * Handle process errors (override in subclasses)
   */
  protected handleError(_output: string): void {
    // Override in subclasses for custom error handling
  }

  /**
   * Check if port is available (override if needed)
   */
  protected async checkPort(): Promise<void> {
    // Override in subclasses
  }

  /**
   * Wait for service to be ready (must override)
   */
  protected abstract waitForReady(): Promise<void>;
}

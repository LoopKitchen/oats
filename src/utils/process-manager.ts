import { execa, ExecaChildProcess } from 'execa';
import { PlatformUtils } from './platform.js';
import { Logger } from './logger.js';

const logger = new Logger('ProcessManager');

export interface ProcessOptions {
  cwd?: string;
  env?: Record<string, string>;
  shell?: boolean;
}

export class ProcessManager {
  private activeProcesses: Map<string, ExecaChildProcess> = new Map();

  /**
   * Start a process with platform-specific handling
   */
  startProcess(
    command: string,
    args: string[],
    options: ProcessOptions = {}
  ): ExecaChildProcess {
    const platformConfig = PlatformUtils.getConfig();

    // Use the correct executable for package managers on Windows
    if (['npm', 'yarn', 'pnpm'].includes(command)) {
      command = PlatformUtils.getNpmExecutable(command as any);
    }

    const processOptions = {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
        FORCE_COLOR: '1',
      },
      shell: options.shell ?? platformConfig.useShell,
      windowsHide: true, // Hide console window on Windows
      cleanup: true, // Kill child processes when parent dies
    };

    logger.debug(`Starting process: ${command} ${args.join(' ')}`);

    const child = execa(command, args, processOptions);

    // Track the process
    const processId = `${command}-${Date.now()}`;
    this.activeProcesses.set(processId, child);

    // Remove from tracking when process exits
    child.on('exit', () => {
      this.activeProcesses.delete(processId);
    });

    return child;
  }

  /**
   * Kill a process gracefully with platform-specific handling
   */
  async killProcess(child: ExecaChildProcess): Promise<void> {
    if (!child || child.killed) return;

    const platformConfig = PlatformUtils.getConfig();

    return new Promise((resolve) => {
      child.on('exit', () => {
        logger.debug(`Process exited: PID ${child.pid}`);
        resolve();
      });

      // Try graceful shutdown first
      child.kill(platformConfig.processTermSignal);

      // Force kill after timeout
      setTimeout(() => {
        if (!child.killed) {
          logger.warn(`Force killing process: PID ${child.pid}`);
          child.kill('SIGKILL');
          resolve();
        }
      }, 5000);
    });
  }

  /**
   * Kill all active processes
   */
  async killAll(): Promise<void> {
    logger.info('Killing all active processes...');

    const killPromises = Array.from(this.activeProcesses.values()).map(
      (child) => this.killProcess(child)
    );

    await Promise.all(killPromises);
    this.activeProcesses.clear();
  }

  /**
   * Check if any processes are running
   */
  hasActiveProcesses(): boolean {
    return this.activeProcesses.size > 0;
  }
}

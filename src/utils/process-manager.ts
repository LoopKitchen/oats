import { execa, type ExecaChildProcess } from 'execa';
import type { StdioOption } from 'execa';
import { PlatformUtils } from './platform.js';
import { Logger } from './logger.js';

const logger = new Logger('ProcessManager');

export interface ProcessOptions {
  cwd?: string;
  env?: Record<string, string>;
  shell?: boolean;
  stdio?: 'pipe' | 'overlapped' | 'ignore' | 'inherit' | readonly StdioOption[];
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
      stdio: options.stdio ?? 'pipe',
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
    if (!child) return;
    if (child.exitCode !== null) return;

    const platformConfig = PlatformUtils.getConfig();
    const isWindows = PlatformUtils.isWindows;

    return new Promise((resolve) => {
      let settled = false;
      const timeouts: NodeJS.Timeout[] = [];

      const cleanup = () => {
        if (settled) return;
        settled = true;

        timeouts.forEach((timeout) => clearTimeout(timeout));
        child.off('exit', onExit);
        child.off('error', onExit);

        resolve();
      };

      const onExit = () => {
        logger.debug(`Process exited: PID ${child.pid}`);
        cleanup();
      };

      child.once('exit', onExit);
      child.once('error', onExit);

      const sendSignal = async (signal: NodeJS.Signals) => {
        if (settled || child.exitCode !== null) {
          return;
        }

        try {
          if (signal === 'SIGKILL' && child.pid) {
            await PlatformUtils.killProcess(child.pid, signal);
          } else {
            child.kill(signal);
          }
          logger.debug(`Sent ${signal} to PID ${child.pid}`);
        } catch (error) {
          logger.debug(
            `Failed to send ${signal} to PID ${child.pid}: ${String(error)}`
          );
        }
      };

      const schedule = (fn: () => void, delay: number) => {
        const timeout = setTimeout(() => {
          if (!settled) {
            fn();
          }
        }, delay);
        timeouts.push(timeout);
      };

      if (!isWindows) {
        // Propagate Ctrl+C to child processes first for fast exits
        schedule(() => {
          void sendSignal('SIGINT');
        }, 0);
      }

      // Follow up with the platform-preferred termination signal
      schedule(() => {
        void sendSignal(platformConfig.processTermSignal);
      }, isWindows ? 0 : 150);

      // Escalate quickly if the process does not cooperate
      schedule(() => {
        void sendSignal('SIGKILL');
      }, isWindows ? 500 : 750);

      // Final fallback so shutdown never hangs indefinitely
      schedule(() => {
        if (!settled) {
          logger.debug(
            `Force resolving shutdown for PID ${child.pid}; process did not exit in time`
          );
          cleanup();
        }
      }, 2000);
    });
  }

  /**
   * Kill all active processes
   */
  async killAll(): Promise<void> {
    // Silent during shutdown

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

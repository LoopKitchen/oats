import { promises as fs } from 'fs';
import path from 'path';
import { execa } from 'execa';
import { Logger } from './logger.js';

const logger = new Logger('Platform');

export interface PlatformConfig {
  fileWatcherDebounce: number;
  portCleanupWait: number;
  processTermSignal: NodeJS.Signals;
  useShell: boolean;
}

export class PlatformUtils {
  public static readonly isWindows = process.platform === 'win32';
  public static readonly isMac = process.platform === 'darwin';
  public static readonly isLinux = process.platform === 'linux';

  static getConfig(): PlatformConfig {
    if (this.isWindows) {
      return {
        fileWatcherDebounce: 500, // Windows triggers multiple events
        portCleanupWait: 3000, // Windows holds ports longer
        processTermSignal: 'SIGKILL' as NodeJS.Signals, // Windows doesn't support SIGTERM well
        useShell: true, // Windows needs shell for some commands
      };
    }

    return {
      fileWatcherDebounce: 100,
      portCleanupWait: 1000,
      processTermSignal: 'SIGTERM' as NodeJS.Signals,
      useShell: false,
    };
  }

  /**
   * Touch a file to trigger HMR (cross-platform)
   */
  static async touchFile(filePath: string): Promise<void> {
    try {
      if (this.isWindows) {
        // Windows: Update file timestamp
        const now = new Date();
        await fs.utimes(filePath, now, now);
        logger.debug(`Touched file (Windows): ${filePath}`);
      } else {
        // Unix: Use native touch command
        await execa('touch', [filePath]);
        logger.debug(`Touched file (Unix): ${filePath}`);
      }
    } catch (error) {
      logger.warn(`Failed to touch file ${filePath}: ${error}`);
      // Fallback: Write empty string to trigger change
      await fs.appendFile(filePath, '');
    }
  }

  /**
   * Kill a process (cross-platform)
   */
  static async killProcess(
    pid: number,
    signal?: NodeJS.Signals
  ): Promise<void> {
    const config = this.getConfig();
    const killSignal = signal || config.processTermSignal;

    try {
      if (this.isWindows) {
        // Windows: Use taskkill
        await execa('taskkill', ['/F', '/PID', pid.toString()], {
          shell: true,
          windowsHide: true,
        });
        logger.debug(`Killed process ${pid} (Windows)`);
      } else {
        // Unix: Use standard kill
        process.kill(pid, killSignal);
        logger.debug(`Killed process ${pid} with signal ${killSignal} (Unix)`);
      }
    } catch (error: any) {
      if (error.code !== 'ESRCH') {
        // Process not found is OK
        throw error;
      }
    }
  }

  /**
   * Wait for port cleanup (platform-specific timing)
   */
  static async waitForPortCleanup(): Promise<void> {
    const config = this.getConfig();
    logger.debug(
      `Waiting ${config.portCleanupWait}ms for port cleanup (${process.platform})`
    );
    await new Promise((resolve) => setTimeout(resolve, config.portCleanupWait));
  }

  /**
   * Get file watcher debounce time
   */
  static getFileWatcherDebounce(): number {
    const config = this.getConfig();
    logger.debug(
      `File watcher debounce: ${config.fileWatcherDebounce}ms (${process.platform})`
    );
    return config.fileWatcherDebounce;
  }

  /**
   * Normalize path for the current platform
   */
  static normalizePath(filePath: string): string {
    if (this.isWindows) {
      // Convert forward slashes to backslashes on Windows
      return filePath.replace(/\//g, path.sep);
    }
    return filePath;
  }

  /**
   * Check if running with elevated privileges
   */
  static async hasElevatedPrivileges(): Promise<boolean> {
    if (this.isWindows) {
      try {
        await execa('net', ['session'], { shell: true });
        return true;
      } catch {
        return false;
      }
    } else {
      return process.getuid?.() === 0;
    }
  }

  /**
   * Get npm/yarn executable with proper extension
   */
  static getNpmExecutable(pm: 'npm' | 'yarn' | 'pnpm'): string {
    if (this.isWindows) {
      return `${pm}.cmd`;
    }
    return pm;
  }

  /**
   * Get debug info for platform-specific issues
   */
  static getDebugInfo(): Record<string, any> {
    return {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      isWindows: this.isWindows,
      isMac: this.isMac,
      isLinux: this.isLinux,
      config: this.getConfig(),
    };
  }
}

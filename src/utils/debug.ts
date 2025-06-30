import chalk from 'chalk';
import { PlatformUtils } from './platform.js';
import { Logger, LogLevel } from './logger.js';

export class DebugManager {
  private static isDebugMode = false;

  /**
   * Initialize debug mode based on environment or config
   */
  static init(debug?: boolean): void {
    this.isDebugMode = debug || process.env['OATS_DEBUG'] === 'true';

    if (this.isDebugMode) {
      Logger.setLogLevel(LogLevel.DEBUG);
      console.log(chalk.magenta('🐛 Debug mode enabled'));
      this.printPlatformInfo();
    }
  }

  /**
   * Check if debug mode is enabled
   */
  static isEnabled(): boolean {
    return this.isDebugMode;
  }

  /**
   * Print platform debug information
   */
  static printPlatformInfo(): void {
    const info = PlatformUtils.getDebugInfo();
    console.log(chalk.dim('Platform Information:'));
    console.log(chalk.dim(JSON.stringify(info, null, 2)));
  }

  /**
   * Debug log helper
   */
  static log(message: string, data?: any): void {
    if (this.isDebugMode) {
      const timestamp = new Date().toISOString();
      console.log(chalk.gray(`[${timestamp}] ${message}`));
      if (data) {
        console.log(chalk.gray(JSON.stringify(data, null, 2)));
      }
    }
  }

  /**
   * Create a debug section
   */
  static section(title: string): void {
    if (this.isDebugMode) {
      console.log(chalk.cyan(`\n=== ${title} ===`));
    }
  }

  /**
   * Time a function execution
   */
  static async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (!this.isDebugMode) {
      return fn();
    }

    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      console.log(chalk.gray(`⏱️  ${label}: ${duration}ms`));
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      console.log(chalk.red(`⏱️  ${label}: ${duration}ms (failed)`));
      throw error;
    }
  }
}

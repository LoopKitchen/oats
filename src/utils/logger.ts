import chalk from 'chalk';
import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export class Logger {
  private context: string;
  private static logLevel: LogLevel = LogLevel.INFO;
  private static logFile?: string;

  constructor(context: string) {
    this.context = context;
  }

  static setLogLevel(level: LogLevel): void {
    Logger.logLevel = level;
  }

  static setLogFile(filePath?: string): void {
    if (filePath) {
      Logger.logFile = filePath;
      // Ensure directory exists
      try {
        mkdirSync(dirname(filePath), { recursive: true });
      } catch (error) {
        // Ignore if directory already exists
      }
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [
      LogLevel.DEBUG,
      LogLevel.INFO,
      LogLevel.WARN,
      LogLevel.ERROR,
    ];
    const currentIndex = levels.indexOf(Logger.logLevel);
    const targetIndex = levels.indexOf(level);
    return targetIndex >= currentIndex;
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] [${this.context}] ${message}`;
  }

  private logToFile(level: LogLevel, message: string, ...args: any[]): void {
    // Only log to file if file path is set and log level is debug
    if (Logger.logFile && Logger.logLevel === LogLevel.DEBUG) {
      try {
        const logEntry = `${this.formatMessage(level, message)} ${args
          .map((arg) =>
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
          )
          .join(' ')}\n`;
        appendFileSync(Logger.logFile, logEntry);
      } catch (error) {
        // Silently fail if file logging fails
      }
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(
        chalk.gray(this.formatMessage(LogLevel.DEBUG, message)),
        ...args
      );
    }
    this.logToFile(LogLevel.DEBUG, message, ...args);
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(
        chalk.blue(this.formatMessage(LogLevel.INFO, message)),
        ...args
      );
    }
    this.logToFile(LogLevel.INFO, message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(
        chalk.yellow(this.formatMessage(LogLevel.WARN, message)),
        ...args
      );
    }
    this.logToFile(LogLevel.WARN, message, ...args);
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(
        chalk.red(this.formatMessage(LogLevel.ERROR, message)),
        ...args
      );
    }
    this.logToFile(LogLevel.ERROR, message, ...args);
  }
}

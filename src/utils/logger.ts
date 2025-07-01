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
  private static showTimestamps: boolean = false;
  private static useColors: boolean = true;

  constructor(context: string) {
    this.context = context;
  }

  static setLogLevel(level: LogLevel): void {
    Logger.logLevel = level;
  }

  static setShowTimestamps(show: boolean): void {
    Logger.showTimestamps = show;
  }

  static setUseColors(use: boolean): void {
    Logger.useColors = use;
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
    let formatted = '';

    if (Logger.showTimestamps) {
      const timestamp = new Date().toISOString();
      formatted += `[${timestamp}] `;
    }

    formatted += `[${level.toUpperCase()}] [${this.context}] ${message}`;

    return formatted;
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

  private colorize(text: string, color: typeof chalk.gray): string {
    return Logger.useColors ? color(text) : text;
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(
        this.colorize(this.formatMessage(LogLevel.DEBUG, message), chalk.gray),
        ...args
      );
    }
    this.logToFile(LogLevel.DEBUG, message, ...args);
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(
        this.colorize(this.formatMessage(LogLevel.INFO, message), chalk.blue),
        ...args
      );
    }
    this.logToFile(LogLevel.INFO, message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(
        this.colorize(this.formatMessage(LogLevel.WARN, message), chalk.yellow),
        ...args
      );
    }
    this.logToFile(LogLevel.WARN, message, ...args);
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(
        this.colorize(this.formatMessage(LogLevel.ERROR, message), chalk.red),
        ...args
      );
    }
    this.logToFile(LogLevel.ERROR, message, ...args);
  }
}

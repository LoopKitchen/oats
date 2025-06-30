import { exec } from 'child_process';
import { promisify } from 'util';
import detectPort from 'detect-port';
import chalk from 'chalk';

import { PlatformUtils } from './platform.js';
import { Logger } from './logger.js';

const execAsync = promisify(exec);
const logger = new Logger('PortManager');

export class PortManager {
  /**
   * Check if a port is in use
   */
  static async isPortInUse(port: number): Promise<boolean> {
    try {
      // First try OS-level check for more reliable results
      if (process.platform === 'darwin' || process.platform === 'linux') {
        const { stdout } = await execAsync(
          `lsof -i :${port} -t 2>/dev/null || true`
        );
        const inUse = stdout.trim() !== '';
        logger.debug(`Port ${port}: ${inUse ? 'IN USE' : 'FREE'} (lsof)`);
        return inUse;
      } else if (process.platform === 'win32') {
        const { stdout } = await execAsync(`netstat -an | findstr :${port}`);
        const inUse = stdout.includes('LISTENING');
        logger.debug(`Port ${port}: ${inUse ? 'IN USE' : 'FREE'} (netstat)`);
        return inUse;
      }
    } catch (error) {
      logger.debug(`OS-level port check failed, using detectPort fallback`);
    }

    // Fallback to detectPort
    try {
      const availablePort = await detectPort(port);
      const inUse = availablePort !== port;
      logger.debug(`Port ${port}: ${inUse ? 'IN USE' : 'FREE'} (detectPort)`);
      return inUse;
    } catch (error) {
      logger.error(`Failed to check port ${port}:`, error);
      return false;
    }
  }

  /**
   * Get process IDs using a specific port
   */
  static async getProcessesUsingPort(port: number): Promise<string[]> {
    const pids: string[] = [];

    try {
      if (process.platform === 'darwin' || process.platform === 'linux') {
        const { stdout } = await execAsync(
          `lsof -i :${port} -t 2>/dev/null || true`
        );
        const foundPids = stdout
          .trim()
          .split('\n')
          .filter((pid) => pid && /^\d+$/.test(pid));
        pids.push(...foundPids);
      } else if (process.platform === 'win32') {
        const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
        const lines = stdout.trim().split('\n');
        const pidSet = new Set<string>();

        lines.forEach((line) => {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && /^\d+$/.test(pid) && pid !== '0') {
            pidSet.add(pid);
          }
        });

        pids.push(...Array.from(pidSet));
      }
    } catch (error) {
      logger.debug(`Failed to get processes for port ${port}:`, error);
    }

    return pids;
  }

  /**
   * Free a port by killing processes using it
   */
  static async freePort(port: number, serviceName: string): Promise<void> {
    const isInUse = await this.isPortInUse(port);

    if (!isInUse) {
      logger.debug(`Port ${port} is already free`);
      return;
    }

    console.log(
      chalk.yellow(`⚠️  Port ${port} is already in use for ${serviceName}`)
    );

    const pids = await this.getProcessesUsingPort(port);

    if (pids.length === 0) {
      logger.warn(`Port ${port} is in use but no PIDs found`);
      throw new Error(
        `Port ${port} is in use but could not identify the process`
      );
    }

    console.log(chalk.yellow(`🔄 Attempting to free port ${port}...`));

    // Kill all processes using the port
    for (const pid of pids) {
      logger.debug(`Killing process ${pid} using port ${port}`);
      try {
        await PlatformUtils.killProcess(parseInt(pid, 10));
      } catch (err) {
        logger.debug(`Failed to kill process ${pid}:`, err);
      }
    }

    // Wait for port to be released
    await PlatformUtils.waitForPortCleanup();

    // Verify port is now free
    const stillInUse = await this.isPortInUse(port);
    if (stillInUse) {
      throw new Error(`Failed to free port ${port} after killing processes`);
    }

    console.log(chalk.green(`✅ Port ${port} is now free`));
  }

  /**
   * Find an available port starting from the given port
   */
  static async findAvailablePort(
    startPort: number,
    maxAttempts: number = 10
  ): Promise<number> {
    for (let i = 0; i < maxAttempts; i++) {
      const portToCheck = startPort + i;
      const inUse = await this.isPortInUse(portToCheck);

      if (!inUse) {
        logger.debug(`Found available port: ${portToCheck}`);
        return portToCheck;
      }
    }

    throw new Error(
      `Could not find available port after ${maxAttempts} attempts starting from ${startPort}`
    );
  }
}

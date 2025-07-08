import { exec } from 'child_process';
import { promisify } from 'util';
import detectPort from 'detect-port';
import chalk from 'chalk';
import ora from 'ora';

import { PlatformUtils } from './platform.js';
import { Logger } from './logger.js';

const execAsync = promisify(exec);
const logger = new Logger('PortManager');

export class PortManager {
  /**
   * Force kill a process using system commands
   */
  private static async forceKillProcess(pid: number): Promise<void> {
    try {
      if (process.platform === 'darwin' || process.platform === 'linux') {
        // Try multiple methods to ensure process termination
        const commands = [
          `kill -9 ${pid}`,
          `pkill -9 -P ${pid}`, // Kill child processes too
        ];

        for (const cmd of commands) {
          try {
            await execAsync(cmd);
            logger.debug(`Force killed process ${pid} with: ${cmd}`);
          } catch (err) {
            // Continue trying other methods
          }
        }
      } else if (process.platform === 'win32') {
        // Windows: Use taskkill with tree flag to kill process tree
        await execAsync(`taskkill /F /T /PID ${pid}`);
        logger.debug(`Force killed process tree ${pid} on Windows`);
      }
    } catch (error) {
      logger.debug(`Failed to force kill process ${pid}:`, error);
    }
  }

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
        // Try multiple approaches to find all processes
        const commands = [
          `lsof -i :${port} -t 2>/dev/null || true`,
          `lsof -i tcp:${port} -t 2>/dev/null || true`,
          `lsof -i udp:${port} -t 2>/dev/null || true`,
        ];

        for (const cmd of commands) {
          try {
            const { stdout } = await execAsync(cmd);
            const foundPids = stdout
              .trim()
              .split('\n')
              .filter((pid) => pid && /^\d+$/.test(pid));

            foundPids.forEach((pid) => {
              if (!pids.includes(pid)) {
                pids.push(pid);
              }
            });
          } catch (err) {
            logger.debug(`Command failed: ${cmd}`, err);
          }
        }
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
   * Free a port by killing processes using it with exponential backoff
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

    const spinner = ora(`Attempting to free port ${port}...`).start();

    // Exponential backoff configuration
    const maxAttempts = 5;
    const initialDelay = 500; // 500ms
    const maxDelay = 5000; // 5 seconds
    const backoffMultiplier = 2;

    try {
      const pids = await this.getProcessesUsingPort(port);

      if (pids.length === 0) {
        spinner.fail(
          `Port ${port} is in use but could not find process using it`
        );
        logger.warn(`Port ${port} is in use but no PIDs found`);
        throw new Error(
          `Port ${port} is in use but could not identify the process`
        );
      }

      spinner.text = `Found ${pids.length} process(es) using port ${port}. Terminating...`;

      // Try to free the port with exponential backoff
      let attempt = 0;
      let delay = initialDelay;
      let portFreed = false;

      while (attempt < maxAttempts && !portFreed) {
        attempt++;
        logger.debug(`Attempt ${attempt}/${maxAttempts} to free port ${port}`);

        // Kill processes (use force kill after first attempt)
        for (const pid of pids) {
          const pidNum = parseInt(pid, 10);
          logger.debug(
            `Killing process ${pid} using port ${port} (attempt ${attempt})`
          );

          try {
            if (attempt === 1) {
              // First attempt: graceful termination
              await PlatformUtils.killProcess(pidNum);
            } else if (attempt === 2) {
              // Second attempt: SIGKILL
              if (process.platform === 'win32') {
                await PlatformUtils.killProcess(
                  pidNum,
                  'SIGKILL' as NodeJS.Signals
                );
              } else {
                await PlatformUtils.killProcess(pidNum, 'SIGKILL');
              }
            } else {
              // Third+ attempts: use force kill with system commands
              await this.forceKillProcess(pidNum);
            }
          } catch (err) {
            logger.debug(`Failed to kill process ${pid}:`, err);
          }
        }

        spinner.text = `Waiting ${delay}ms for port ${port} to be released (attempt ${attempt}/${maxAttempts})...`;

        // Wait with current delay
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Check if port is now free
        portFreed = !(await this.isPortInUse(port));

        if (portFreed) {
          spinner.succeed(
            `Port ${port} is now free (freed after ${attempt} attempt${attempt > 1 ? 's' : ''})`
          );
          logger.debug(
            `Port ${port} successfully freed after ${attempt} attempts`
          );
          return;
        }

        // Update pids for next attempt (in case new processes took over)
        const newPids = await this.getProcessesUsingPort(port);
        if (newPids.length > 0 && newPids.join(',') !== pids.join(',')) {
          logger.debug(
            `New processes detected on port ${port}: ${newPids.join(', ')}`
          );
          pids.length = 0;
          pids.push(...newPids);
        }

        // Calculate next delay with exponential backoff
        delay = Math.min(delay * backoffMultiplier, maxDelay);
      }

      // If we get here, all attempts failed
      spinner.fail(`Failed to free port ${port} after ${maxAttempts} attempts`);

      // Check if we need elevated privileges
      const hasElevated = await PlatformUtils.hasElevatedPrivileges();
      if (!hasElevated) {
        console.log(
          chalk.yellow('\n💡 Tip: Try running with elevated privileges:')
        );
        if (process.platform === 'darwin' || process.platform === 'linux') {
          console.log(chalk.cyan('  sudo oats start\n'));
        } else if (process.platform === 'win32') {
          console.log(chalk.cyan('  Run as Administrator\n'));
        }
      }

      throw new Error(
        `Failed to free port ${port} after ${maxAttempts} attempts with exponential backoff`
      );
    } catch (error) {
      if (spinner.isSpinning) {
        spinner.fail(`Failed to free port ${port}`);
      }
      throw error;
    }
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

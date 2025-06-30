/**
 * Tests for DevSyncOrchestrator
 */

import { EventEmitter } from 'events';
import { DevSyncEngine } from '../dev-sync-optimized.js';
import { DevSyncOrchestrator } from '../orchestrator.js';
import { Logger } from '../../utils/logger.js';
import { PortManager } from '../../utils/port-manager.js';
import { ProcessManager } from '../../utils/process-manager.js';
import * as fs from 'fs';
import { DebugManager } from '../../utils/debug.js';
import type { RuntimeConfig } from '../../types/config.types.js';

// Mock dependencies
jest.mock('util', () => ({
  promisify: jest.fn(() => jest.fn()),
  deprecate: jest.fn((fn) => fn),
  inspect: jest.fn(),
  format: jest.fn(),
  inherits: jest.fn(),
}));
jest.mock('detect-port', () => jest.fn().mockResolvedValue(3001));
jest.mock('../../utils/process-manager.js');
jest.mock('child_process', () => ({
  spawn: jest.fn().mockReturnValue({
    on: jest.fn(),
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    kill: jest.fn(),
  }),
  exec: jest.fn(),
}));
jest.mock('chokidar', () => ({
  watch: jest.fn().mockReturnValue({
    on: jest.fn(),
    close: jest.fn(),
  }),
}));
jest.mock('../../utils/port-manager.js');
jest.mock('../../utils/logger.js');
jest.mock('../../utils/debug.js');
jest.mock('../dev-sync-optimized.js');

// Mock chalk to avoid color codes in tests
jest.mock('chalk', () => {
  const mockChalk = (str: string) => str;
  mockChalk.bold = (str: string) => str;

  return {
    default: {
      blue: Object.assign((str: string) => str, { bold: (str: string) => str }),
      green: Object.assign((str: string) => str, {
        bold: (str: string) => str,
      }),
      yellow: Object.assign((str: string) => str, {
        bold: (str: string) => str,
      }),
      red: Object.assign((str: string) => str, { bold: (str: string) => str }),
      dim: (str: string) => str,
    },
    blue: Object.assign((str: string) => str, { bold: (str: string) => str }),
    green: Object.assign((str: string) => str, { bold: (str: string) => str }),
    yellow: Object.assign((str: string) => str, { bold: (str: string) => str }),
    red: Object.assign((str: string) => str, { bold: (str: string) => str }),
    dim: (str: string) => str,
  };
});

describe('DevSyncOrchestrator', () => {
  let orchestrator: DevSyncOrchestrator;
  let mockConfig: RuntimeConfig;
  let mockProcessManager: jest.Mocked<ProcessManager>;
  let mockChildProcess: any;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    jest.clearAllMocks();

    // Clear module mocks to ensure fresh instances
    jest.clearAllMocks();
    jest.resetModules();

    // Mock process.exit to prevent test from exiting
    originalExit = process.exit;
    process.exit = jest.fn() as any;

    // Create mock config
    mockConfig = {
      services: {
        backend: {
          path: '../backend',
          startCommand: 'npm run dev',
          port: 4000,
          apiSpec: {
            path: 'src/swagger.json',
          },
        },
        client: {
          path: '../client',
          packageName: '@test/client',
          generator: 'custom' as const,
          generateCommand: 'npm run generate',
        },
        frontend: {
          path: '../frontend',
          startCommand: 'npm start',
          port: 3000,
        },
      },
      resolvedPaths: {
        backend: '/test/backend',
        client: '/test/client',
        frontend: '/test/frontend',
        apiSpec: '/test/backend/src/swagger.json',
      },
      sync: {},
      log: {},
      packageManager: 'npm' as const,
      isCI: false,
      startedAt: new Date(),
      version: '1.0.0',
      metadata: {},
    } as RuntimeConfig;

    // Mock child process
    mockChildProcess = new EventEmitter();
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    mockChildProcess.kill = jest.fn();
    mockChildProcess.pid = 12345;

    // Setup ProcessManager mock
    mockProcessManager = {
      startProcess: jest.fn().mockReturnValue(mockChildProcess),
      killProcess: jest.fn().mockResolvedValue(undefined),
      killAll: jest.fn().mockResolvedValue(undefined),
    } as any;
    (
      ProcessManager as jest.MockedClass<typeof ProcessManager>
    ).mockImplementation(() => mockProcessManager);

    // Setup PortManager mock
    (PortManager.isPortInUse as jest.Mock).mockResolvedValue(false);
    (PortManager.freePort as jest.Mock).mockResolvedValue(undefined);

    // Setup Logger mock
    (Logger as jest.MockedClass<typeof Logger>).mockImplementation(
      () =>
        ({
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        }) as any
    );

    // Setup DebugManager mock
    (DebugManager.init as jest.Mock).mockReturnValue(undefined);
    (DebugManager.section as jest.Mock).mockReturnValue(undefined);

    // Setup DevSyncEngine mock
    const mockSyncEngine = new EventEmitter() as any;
    mockSyncEngine.start = jest.fn().mockResolvedValue(undefined);
    mockSyncEngine.stop = jest.fn().mockResolvedValue(undefined);
    (
      DevSyncEngine as jest.MockedClass<typeof DevSyncEngine>
    ).mockImplementation(() => mockSyncEngine);

    // Mock fs.existsSync for package manager detection
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();

    // Restore original process.exit
    process.exit = originalExit;

    // Clean up event listeners to prevent warnings
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('uncaughtException');
  });

  describe('constructor', () => {
    it('should initialize services and set up signal handlers', () => {
      orchestrator = new DevSyncOrchestrator(mockConfig);

      expect(ProcessManager).toHaveBeenCalled();
      expect(Logger).toHaveBeenCalledWith('Orchestrator');
      expect(DebugManager.init).toHaveBeenCalledWith(false);
    });

    it('should set log file if configured', () => {
      mockConfig.log.file = '/path/to/log.txt';
      orchestrator = new DevSyncOrchestrator(mockConfig);

      expect(Logger.setLogFile).toHaveBeenCalledWith('/path/to/log.txt');
    });

    it('should initialize debug mode if log level is debug', () => {
      mockConfig.log.level = 'debug';
      orchestrator = new DevSyncOrchestrator(mockConfig);

      expect(DebugManager.init).toHaveBeenCalledWith(true);
    });
  });

  describe('start', () => {
    beforeEach(() => {
      orchestrator = new DevSyncOrchestrator(mockConfig);
    });

    it('should start all services in correct order', async () => {
      // Mock port checks to succeed after services "start"
      let portCheckCount = 0;
      (PortManager.isPortInUse as jest.Mock).mockImplementation(() => {
        portCheckCount++;
        return Promise.resolve(portCheckCount > 2);
      });

      // Make link commands complete quickly
      mockProcessManager.startProcess.mockImplementation((_cmd, args) => {
        const proc = new EventEmitter() as any;
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.kill = jest.fn();

        // Complete link commands immediately
        if (args[0] === 'link') {
          setTimeout(() => proc.emit('exit', 0), 10);
        }

        return proc;
      });

      await orchestrator.start();

      // Verify link commands were called first
      expect(mockProcessManager.startProcess).toHaveBeenCalledWith(
        'npm',
        ['link'],
        expect.objectContaining({
          cwd: '/test/client',
        })
      );

      expect(mockProcessManager.startProcess).toHaveBeenCalledWith(
        'npm',
        ['link', '@test/client'],
        expect.objectContaining({
          cwd: '/test/frontend',
        })
      );

      // Verify services started after linking
      expect(mockProcessManager.startProcess).toHaveBeenCalledWith(
        'npm',
        ['run', 'dev'],
        expect.objectContaining({
          cwd: '/test/backend',
        })
      );

      expect(mockProcessManager.startProcess).toHaveBeenCalledWith(
        'npm',
        ['run', 'generate'],
        expect.objectContaining({
          cwd: '/test/client',
        })
      );

      // Check frontend process was started
      expect(mockProcessManager.startProcess).toHaveBeenCalledWith(
        'npm',
        ['start'],
        expect.objectContaining({
          cwd: '/test/frontend',
        })
      );

      // Verify sync engine started
      expect(DevSyncEngine).toHaveBeenCalledWith(mockConfig);

      // The sync engine instance should have start called
      const syncInstances = (
        DevSyncEngine as jest.MockedClass<typeof DevSyncEngine>
      ).mock.instances;
      expect(syncInstances.length).toBeGreaterThan(0);

      // Since we've verified length > 0, we can safely access the first instance
      const mockSyncEngine = syncInstances[0] as any;
      expect(mockSyncEngine.start).toHaveBeenCalled();
    }, 10000);

    it('should handle backend service without frontend', async () => {
      delete mockConfig.services.frontend;
      delete mockConfig.resolvedPaths.frontend;
      orchestrator = new DevSyncOrchestrator(mockConfig);

      // Mock port checks
      (PortManager.isPortInUse as jest.Mock).mockResolvedValue(true);

      await orchestrator.start();

      // Should only start backend and client
      expect(mockProcessManager.startProcess).toHaveBeenCalledTimes(2);
    });

    it('should emit serviceStateChange events', async () => {
      const stateChangeSpy = jest.fn();
      orchestrator.on('serviceStateChange', stateChangeSpy);

      // Mock port checks to succeed immediately
      (PortManager.isPortInUse as jest.Mock).mockResolvedValue(true);

      // Make all processes complete quickly
      mockProcessManager.startProcess.mockImplementation(() => {
        const proc = new EventEmitter() as any;
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.kill = jest.fn();
        setTimeout(() => proc.emit('exit', 0), 10);
        return proc;
      });

      await orchestrator.start();

      // Should emit state changes for each service
      expect(stateChangeSpy).toHaveBeenCalled();
      expect(stateChangeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          service: expect.any(String),
          state: expect.any(String),
        })
      );
    }, 10000);

    it('should handle quiet mode', async () => {
      mockConfig.log.quiet = true;
      orchestrator = new DevSyncOrchestrator(mockConfig);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      // Mock port checks to succeed immediately
      (PortManager.isPortInUse as jest.Mock).mockResolvedValue(true);

      // Make all processes complete quickly
      mockProcessManager.startProcess.mockImplementation(() => {
        const proc = new EventEmitter() as any;
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.kill = jest.fn();
        setTimeout(() => proc.emit('exit', 0), 10);
        return proc;
      });

      await orchestrator.start();

      // Should not log success message in quiet mode
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('All services started successfully')
      );

      consoleSpy.mockRestore();
    }, 10000);

    it('should shutdown on start failure', async () => {
      // Make port checks fail
      (PortManager.isPortInUse as jest.Mock).mockResolvedValue(false);

      // Make all processes complete quickly to avoid timeout
      mockProcessManager.startProcess.mockImplementation(() => {
        const proc = new EventEmitter() as any;
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.kill = jest.fn();
        setTimeout(() => proc.emit('exit', 0), 10);
        return proc;
      });

      const shutdownSpy = jest
        .spyOn(orchestrator, 'shutdown')
        .mockResolvedValue(undefined);

      await expect(orchestrator.start()).rejects.toThrow();

      expect(shutdownSpy).toHaveBeenCalled();
    }, 15000);
  });

  describe('shutdown', () => {
    beforeEach(async () => {
      orchestrator = new DevSyncOrchestrator(mockConfig);
      // Mock port checks to succeed immediately
      (PortManager.isPortInUse as jest.Mock).mockResolvedValue(true);

      // Make all processes complete quickly
      mockProcessManager.startProcess.mockImplementation(() => {
        const proc = new EventEmitter() as any;
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.kill = jest.fn();
        setTimeout(() => proc.emit('exit', 0), 10);
        return proc;
      });

      await orchestrator.start();
    });

    it('should stop all services and sync engine', async () => {
      await orchestrator.shutdown();

      // Verify sync engine stopped
      const syncInstances = (
        DevSyncEngine as jest.MockedClass<typeof DevSyncEngine>
      ).mock.instances;
      expect(syncInstances.length).toBeGreaterThan(0);

      // Since we've verified length > 0, we can safely access the first instance
      const mockSyncEngine = syncInstances[0] as any;
      expect(mockSyncEngine.stop).toHaveBeenCalled();

      // Verify process manager killed all processes
      expect(mockProcessManager.killAll).toHaveBeenCalled();

      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should only shutdown once', async () => {
      const shutdownPromise1 = orchestrator.shutdown();
      const shutdownPromise2 = orchestrator.shutdown();

      await Promise.all([shutdownPromise1, shutdownPromise2]);

      // killAll should only be called once
      expect(mockProcessManager.killAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('package linking', () => {
    it('should link client package to frontend', async () => {
      orchestrator = new DevSyncOrchestrator(mockConfig);

      // Mock port checks
      (PortManager.isPortInUse as jest.Mock).mockResolvedValue(true);

      // Track commands executed
      const commands: string[] = [];
      mockProcessManager.startProcess.mockImplementation((cmd, args) => {
        commands.push(`${cmd} ${args.join(' ')}`);

        // Return a mock process that completes successfully
        const mockProc = new EventEmitter();
        setTimeout(() => mockProc.emit('exit', 0), 10);
        return mockProc as any;
      });

      await orchestrator.start();

      // Should have linked the package
      expect(commands).toContain('npm link');
      expect(commands).toContain('npm link @test/client');
    });
  });

  describe('config file watching', () => {
    it('should watch config file for changes', async () => {
      // Get the mocked chokidar module
      // Using jest's module mocking system
      const chokidar = jest.requireMock('chokidar');
      const mockWatcher = {
        on: jest.fn(),
        close: jest.fn(),
      };

      // Reset the mock
      (chokidar.watch as jest.Mock).mockReturnValue(mockWatcher);

      orchestrator = new DevSyncOrchestrator(mockConfig);

      // Mock port checks to succeed immediately
      (PortManager.isPortInUse as jest.Mock).mockResolvedValue(true);

      // Make all processes complete quickly
      mockProcessManager.startProcess.mockImplementation(() => {
        const proc = new EventEmitter() as any;
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.kill = jest.fn();
        setTimeout(() => proc.emit('exit', 0), 10);
        return proc;
      });

      await orchestrator.start();

      // Config watching happens in start()
      const watchMock = chokidar.watch as jest.Mock;
      expect(watchMock).toHaveBeenCalled();

      // Check the first call to watch was for config file
      const watchCalls = watchMock.mock.calls;
      const configWatchCall = watchCalls.find(
        (call: any[]) => call[0] === 'oats.config.json'
      );
      expect(configWatchCall).toBeDefined();

      // We've verified configWatchCall is defined above, so we can safely check its properties
      // Get the call and verify its options
      const callOptions = configWatchCall ? configWatchCall[1] : null;
      expect(callOptions).toEqual({
        persistent: true,
        ignoreInitial: true,
      });

      expect(mockWatcher.on).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    }, 10000);
  });

  describe('signal handlers', () => {
    it('should handle SIGINT gracefully', async () => {
      orchestrator = new DevSyncOrchestrator(mockConfig);

      const shutdownSpy = jest
        .spyOn(orchestrator, 'shutdown')
        .mockResolvedValue(undefined);

      // Emit SIGINT
      process.emit('SIGINT' as any);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(shutdownSpy).toHaveBeenCalled();
    });

    it('should handle uncaught exceptions', async () => {
      orchestrator = new DevSyncOrchestrator(mockConfig);

      const shutdownSpy = jest
        .spyOn(orchestrator, 'shutdown')
        .mockResolvedValue(undefined);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      // Emit uncaught exception
      process.emit('uncaughtException', new Error('Test error'));

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Uncaught exception'),
        expect.any(Error)
      );
      expect(shutdownSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });
});

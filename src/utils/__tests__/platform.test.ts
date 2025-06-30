/**
 * Tests for Platform Utilities
 */

import { PlatformUtils } from '../platform.js';
import { promises as fs } from 'fs';
import { execa } from 'execa';

jest.mock('child_process');
jest.mock('util', () => ({
  promisify: jest.fn(() => jest.fn()),
}));
jest.mock('fs', () => ({
  promises: {
    utimes: jest.fn(),
    appendFile: jest.fn(),
  },
}));
jest.mock('execa');

describe('PlatformUtils', () => {
  let originalPlatform: NodeJS.Platform;

  beforeEach(() => {
    originalPlatform = process.platform;
    jest.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });

  describe('platform detection', () => {
    it('should detect Windows platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });

      expect(PlatformUtils.isWindows).toBe(true);
      expect(PlatformUtils.isMac).toBe(false);
      expect(PlatformUtils.isLinux).toBe(false);
    });

    it('should detect Mac platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });

      expect(PlatformUtils.isWindows).toBe(false);
      expect(PlatformUtils.isMac).toBe(true);
      expect(PlatformUtils.isLinux).toBe(false);
    });

    it('should detect Linux platform', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
      });

      expect(PlatformUtils.isWindows).toBe(false);
      expect(PlatformUtils.isMac).toBe(false);
      expect(PlatformUtils.isLinux).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return Windows-specific config on Windows', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });

      const config = PlatformUtils.getConfig();

      expect(config.fileWatcherDebounce).toBe(500);
      expect(config.portCleanupWait).toBe(3000);
      expect(config.processTermSignal).toBe('SIGKILL');
      expect(config.useShell).toBe(true);
    });

    it('should return default config on non-Windows', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });

      const config = PlatformUtils.getConfig();

      expect(config.fileWatcherDebounce).toBe(100);
      expect(config.portCleanupWait).toBe(1000);
      expect(config.processTermSignal).toBe('SIGTERM');
      expect(config.useShell).toBe(true);
    });
  });

  describe('getNpmExecutable', () => {
    it('should add .cmd extension on Windows', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });

      expect(PlatformUtils.getNpmExecutable('npm')).toBe('npm.cmd');
      expect(PlatformUtils.getNpmExecutable('yarn')).toBe('yarn.cmd');
      expect(PlatformUtils.getNpmExecutable('pnpm')).toBe('pnpm.cmd');
    });

    it('should return unchanged on non-Windows', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });

      expect(PlatformUtils.getNpmExecutable('npm')).toBe('npm');
      expect(PlatformUtils.getNpmExecutable('yarn')).toBe('yarn');
      expect(PlatformUtils.getNpmExecutable('pnpm')).toBe('pnpm');
    });
  });

  describe('killProcess', () => {
    it('should use taskkill on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });

      const mockExeca = execa as jest.Mock;
      mockExeca.mockResolvedValue({ stdout: '' });

      await PlatformUtils.killProcess(1234);

      expect(mockExeca).toHaveBeenCalledWith(
        'taskkill',
        ['/F', '/PID', '1234'],
        expect.objectContaining({
          shell: true,
          windowsHide: true,
        })
      );
    });

    it('should use kill -9 on Unix', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });

      const mockKill = jest
        .spyOn(process, 'kill')
        .mockImplementation(() => true);

      await PlatformUtils.killProcess(1234);

      expect(mockKill).toHaveBeenCalledWith(1234, 'SIGTERM');
      expect(execa).not.toHaveBeenCalled();

      mockKill.mockRestore();
    });

    it('should handle kill errors gracefully', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });

      const mockKill = jest.spyOn(process, 'kill').mockImplementation(() => {
        const error: any = new Error('Process not found');
        error.code = 'ESRCH';
        throw error;
      });

      // Should not throw for ESRCH
      await expect(PlatformUtils.killProcess(1234)).resolves.toBeUndefined();

      mockKill.mockRestore();
    });
  });

  describe('touchFile', () => {
    it('should use fs.utimes on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });

      const mockUtimes = fs.utimes as jest.Mock;
      mockUtimes.mockResolvedValue(undefined);

      await PlatformUtils.touchFile('/path/to/file');

      expect(mockUtimes).toHaveBeenCalledWith(
        '/path/to/file',
        expect.any(Date),
        expect.any(Date)
      );
      expect(execa).not.toHaveBeenCalled();
    });

    it('should use touch command on Unix', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });

      const mockExeca = execa as jest.Mock;
      mockExeca.mockResolvedValue({ stdout: '' });

      await PlatformUtils.touchFile('/path/to/file');

      expect(mockExeca).toHaveBeenCalledWith('touch', ['/path/to/file']);
      expect(fs.utimes).not.toHaveBeenCalled();
    });

    it('should fallback to appendFile on error', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });

      const mockExeca = execa as jest.Mock;
      mockExeca.mockRejectedValue(new Error('Command failed'));

      const mockAppendFile = fs.appendFile as jest.Mock;
      mockAppendFile.mockResolvedValue(undefined);

      await PlatformUtils.touchFile('/path/to/file');

      expect(mockAppendFile).toHaveBeenCalledWith('/path/to/file', '');
    });
  });

  describe('timing utilities', () => {
    it('should return file watcher debounce time', () => {
      expect(PlatformUtils.getFileWatcherDebounce()).toBe(
        PlatformUtils.getConfig().fileWatcherDebounce
      );
    });

    it('should wait for port cleanup', async () => {
      jest.useFakeTimers();

      const waitPromise = PlatformUtils.waitForPortCleanup();

      jest.advanceTimersByTime(PlatformUtils.getConfig().portCleanupWait);

      await waitPromise;

      jest.useRealTimers();
    });
  });

  describe('additional utilities', () => {
    it('should normalize paths on Windows', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });

      const normalized = PlatformUtils.normalizePath('path/to/file');
      expect(normalized).toBe('path\\to\\file');
    });

    it('should not change paths on Unix', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });

      const normalized = PlatformUtils.normalizePath('path/to/file');
      expect(normalized).toBe('path/to/file');
    });

    it('should check elevated privileges on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });

      const mockExeca = execa as jest.Mock;
      mockExeca.mockResolvedValue({ stdout: '' });

      const hasPrivileges = await PlatformUtils.hasElevatedPrivileges();
      expect(hasPrivileges).toBe(true);
      expect(mockExeca).toHaveBeenCalledWith('net', ['session'], {
        shell: true,
      });
    });

    it('should check elevated privileges on Unix', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });

      const originalGetuid = process.getuid;
      process.getuid = jest.fn(() => 0);

      const hasPrivileges = await PlatformUtils.hasElevatedPrivileges();
      expect(hasPrivileges).toBe(true);

      process.getuid = originalGetuid;
    });

    it('should get debug info', () => {
      const debugInfo = PlatformUtils.getDebugInfo();

      expect(debugInfo).toHaveProperty('platform');
      expect(debugInfo).toHaveProperty('arch');
      expect(debugInfo).toHaveProperty('nodeVersion');
      expect(debugInfo).toHaveProperty('isWindows');
      expect(debugInfo).toHaveProperty('isMac');
      expect(debugInfo).toHaveProperty('isLinux');
      expect(debugInfo).toHaveProperty('config');
    });
  });
});

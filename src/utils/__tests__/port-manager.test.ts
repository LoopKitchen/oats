/**
 * Tests for Port Manager
 */

import { PortManager } from '../port-manager.js';
import { promisify } from 'util';
import detectPort from 'detect-port';
import { PlatformUtils } from '../platform.js';

jest.mock('child_process');
jest.mock('util', () => ({
  promisify: jest.fn(() => jest.fn()),
}));
jest.mock('detect-port');
jest.mock('../platform.js');

describe('PortManager', () => {
  let originalPlatform: NodeJS.Platform;
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    originalPlatform = process.platform;
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('isPortInUse', () => {
    it('should detect port in use on macOS/Linux', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });

      const mockExecAsync = jest.fn().mockResolvedValue({ stdout: '12345\n' });
      (promisify as unknown as jest.Mock).mockReturnValue(mockExecAsync);

      const inUse = await PortManager.isPortInUse(3000);

      expect(inUse).toBe(true);
      expect(mockExecAsync).toHaveBeenCalledWith(
        'lsof -i :3000 -t 2>/dev/null'
      );
    });

    it('should detect port not in use on macOS/Linux', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
      });

      const mockExecAsync = jest.fn().mockResolvedValue({ stdout: '' });
      (promisify as unknown as jest.Mock).mockReturnValue(mockExecAsync);

      const inUse = await PortManager.isPortInUse(3000);

      expect(inUse).toBe(false);
    });

    it('should detect port in use on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });

      const mockExecAsync = jest.fn().mockResolvedValue({
        stdout: 'TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    1234',
      });
      (promisify as unknown as jest.Mock).mockReturnValue(mockExecAsync);

      const inUse = await PortManager.isPortInUse(3000);

      expect(inUse).toBe(true);
      expect(mockExecAsync).toHaveBeenCalledWith('netstat -an | findstr :3000');
    });

    it('should fallback to detect-port on OS command failure', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });

      const mockExecAsync = jest
        .fn()
        .mockRejectedValue(new Error('Command failed'));
      (promisify as unknown as jest.Mock).mockReturnValue(mockExecAsync);

      const mockDetectPort = detectPort as jest.Mock;
      mockDetectPort.mockResolvedValue(3001); // Different port means 3000 is in use

      const inUse = await PortManager.isPortInUse(3000);

      expect(inUse).toBe(true);
      expect(mockDetectPort).toHaveBeenCalledWith(3000);
    });

    it('should return false when both methods fail', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });

      const mockExecAsync = jest
        .fn()
        .mockRejectedValue(new Error('Command failed'));
      (promisify as unknown as jest.Mock).mockReturnValue(mockExecAsync);

      const mockDetectPort = detectPort as jest.Mock;
      mockDetectPort.mockRejectedValue(new Error('Detection failed'));

      const inUse = await PortManager.isPortInUse(3000);

      expect(inUse).toBe(false);
    });
  });

  describe('freePort', () => {
    it('should kill process using port on macOS/Linux', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });

      const mockExecAsync = jest
        .fn()
        .mockResolvedValueOnce({ stdout: '12345\n67890\n' }) // lsof
        .mockResolvedValueOnce({ stdout: '' }); // Second check shows port is free

      (promisify as unknown as jest.Mock).mockReturnValue(mockExecAsync);
      (PlatformUtils.killProcess as jest.Mock).mockResolvedValue(undefined);
      (PlatformUtils.waitForPortCleanup as jest.Mock).mockResolvedValue(
        undefined
      );

      await PortManager.freePort(3000, 'test-service');

      expect(PlatformUtils.killProcess).toHaveBeenCalledWith(12345);
      expect(PlatformUtils.killProcess).toHaveBeenCalledWith(67890);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Port 3000 is now free')
      );
    });

    it('should kill process using port on Windows', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });

      const mockExecAsync = jest
        .fn()
        .mockResolvedValueOnce({
          stdout:
            'TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    1234\nTCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    5678',
        })
        .mockResolvedValueOnce({ stdout: '' }); // Second check shows port is free

      (promisify as unknown as jest.Mock).mockReturnValue(mockExecAsync);
      (PlatformUtils.killProcess as jest.Mock).mockResolvedValue(undefined);
      (PlatformUtils.waitForPortCleanup as jest.Mock).mockResolvedValue(
        undefined
      );

      await PortManager.freePort(3000, 'test-service');

      expect(PlatformUtils.killProcess).toHaveBeenCalledWith(1234);
      expect(PlatformUtils.killProcess).toHaveBeenCalledWith(5678);
    });

    it('should not try to kill if port is not in use', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });

      const mockExecAsync = jest.fn().mockResolvedValue({ stdout: '' });
      (promisify as unknown as jest.Mock).mockReturnValue(mockExecAsync);

      // Mock isPortInUse to return false
      jest.spyOn(PortManager, 'isPortInUse').mockResolvedValue(false);

      await PortManager.freePort(3000, 'test-service');

      expect(PlatformUtils.killProcess).not.toHaveBeenCalled();
    });

    it('should throw error if port cannot be freed', async () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });

      const mockExecAsync = jest.fn().mockResolvedValue({ stdout: '12345\n' }); // Always returns PIDs

      (promisify as unknown as jest.Mock).mockReturnValue(mockExecAsync);
      (PlatformUtils.killProcess as jest.Mock).mockResolvedValue(undefined);
      (PlatformUtils.waitForPortCleanup as jest.Mock).mockResolvedValue(
        undefined
      );

      // Mock isPortInUse to always return true
      jest
        .spyOn(PortManager, 'isPortInUse')
        .mockResolvedValueOnce(true) // Initial check
        .mockResolvedValueOnce(true); // After kill attempt

      await expect(PortManager.freePort(3000, 'test-service')).rejects.toThrow(
        'Failed to free port 3000'
      );
    });
  });
});

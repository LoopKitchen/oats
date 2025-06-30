/**
 * Tests for Debug Manager
 */

import { DebugManager } from '../debug.js';

// Mock chalk to avoid color codes in tests
jest.mock('chalk', () => ({
  default: {
    gray: (str: string) => str,
    cyan: (str: string) => str,
    red: (str: string) => str,
  },
  gray: (str: string) => str,
  cyan: (str: string) => str,
  red: (str: string) => str,
}));

describe('DebugManager', () => {
  let originalConsoleLog: typeof console.log;

  beforeEach(() => {
    originalConsoleLog = console.log;
    console.log = jest.fn();
    // Reset debug mode
    DebugManager.init(false);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  describe('init', () => {
    it('should initialize with debug mode enabled', () => {
      DebugManager.init(true);
      expect(DebugManager.isEnabled()).toBe(true);
    });

    it('should initialize with debug mode disabled', () => {
      DebugManager.init(false);
      expect(DebugManager.isEnabled()).toBe(false);
    });
  });

  describe('log', () => {
    it('should log messages when debug is enabled', () => {
      DebugManager.init(true);
      DebugManager.log('test message', { foo: 'bar' });

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]'),
        'test message',
        { foo: 'bar' }
      );
    });

    it('should not log messages when debug is disabled', () => {
      DebugManager.init(false);
      DebugManager.log('test message');

      expect(console.log).not.toHaveBeenCalled();
    });
  });

  describe('time', () => {
    it('should measure async function execution time when debug is enabled', async () => {
      DebugManager.init(true);

      const testFn = jest.fn().mockResolvedValue('result');
      const result = await DebugManager.time('operation', testFn);

      expect(result).toBe('result');
      expect(testFn).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('⏱️  operation:'),
        expect.stringMatching(/\d+ms/)
      );
    });

    it('should just execute function when debug is disabled', async () => {
      DebugManager.init(false);

      const testFn = jest.fn().mockResolvedValue('result');
      const result = await DebugManager.time('operation', testFn);

      expect(result).toBe('result');
      expect(testFn).toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
    });

    it('should handle function errors', async () => {
      DebugManager.init(true);

      const error = new Error('Test error');
      const testFn = jest.fn().mockRejectedValue(error);

      await expect(DebugManager.time('operation', testFn)).rejects.toThrow(
        'Test error'
      );

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('⏱️  operation:'),
        expect.stringContaining('(failed)')
      );
    });
  });

  describe('section', () => {
    it('should log section header when debug is enabled', () => {
      DebugManager.init(true);
      DebugManager.section('Test Section');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('=== Test Section ===')
      );
    });

    it('should not log section when debug is disabled', () => {
      DebugManager.init(false);
      DebugManager.section('Test Section');

      expect(console.log).not.toHaveBeenCalled();
    });
  });
});

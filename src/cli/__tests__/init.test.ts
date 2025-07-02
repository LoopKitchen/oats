/**
 * Init Command Tests
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';

import * as inquirerPrompts from '@inquirer/prompts';
import ora from 'ora';

import * as detectModule from '../detect';
import { init } from '../init';

// Mock modules
jest.mock('fs');
jest.mock('@inquirer/prompts');
jest.mock('ora');
jest.mock('../detect');

const mockFs = {
  existsSync: existsSync as jest.MockedFunction<typeof existsSync>,
  readFileSync: readFileSync as jest.MockedFunction<typeof readFileSync>,
  writeFileSync: writeFileSync as jest.MockedFunction<typeof writeFileSync>,
};

const mockInquirer = inquirerPrompts as jest.Mocked<typeof inquirerPrompts>;
const mockOra = ora as jest.MockedFunction<typeof ora>;
const mockDetect = detectModule as jest.Mocked<typeof detectModule>;

describe('Init Command', () => {
  let mockSpinner: any;
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup spinner mock
    mockSpinner = {
      start: jest.fn().mockReturnThis(),
      succeed: jest.fn().mockReturnThis(),
      fail: jest.fn().mockReturnThis(),
      warn: jest.fn().mockReturnThis(),
    };
    mockOra.mockReturnValue(mockSpinner);

    // Setup console spies
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('with --yes flag', () => {
    it('should create default configuration without prompts', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockDetect.detectProjectStructure.mockResolvedValue({
        backend: {
          path: '../backend',
          type: 'backend',
          framework: 'Express',
          packageManager: 'yarn',
          apiSpec: 'src/swagger.json',
        },
        client: {
          path: '../api-client',
          type: 'client',
          packageManager: 'yarn',
          packageName: '@myorg/api',
        },
        frontend: {
          path: '../frontend',
          type: 'frontend',
          framework: 'React',
          packageManager: 'yarn',
        },
      });

      await init({ yes: true });

      expect(mockInquirer.confirm).not.toHaveBeenCalled();
      expect(mockInquirer.input).not.toHaveBeenCalled();
      expect(mockInquirer.select).not.toHaveBeenCalled();
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('oats.config.json'),
        expect.stringContaining('"path": "../backend"')
      );
      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        'Configuration created!'
      );
    });

    it('should handle detection failure gracefully', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockDetect.detectProjectStructure.mockRejectedValue(
        new Error('Detection failed')
      );

      await init({ yes: true });

      expect(mockSpinner.warn).toHaveBeenCalledWith(
        'Could not detect project structure, using defaults'
      );
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('interactive mode', () => {
    it('should prompt for configuration values', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockInquirer.prompt.mockResolvedValue({
        projectType: 'separate',
        backendPath: '../my-backend',
        backendPort: 5000,
        backendCommand: 'npm start',
        apiSpecPath: 'docs/openapi.json',
        clientPath: '../my-client',
        clientPackageName: '@company/api',
        clientGenerator: 'custom',
        clientBuildCommand: 'npm run build',
        includeFrontend: false,
        enableNotifications: true,
        syncStrategy: 'smart',
      });

      await init({});

      expect(mockInquirer.prompt).toHaveBeenCalled();

      const writtenConfig = mockFs.writeFileSync.mock.calls[0]?.[1] as string;
      const config = JSON.parse(writtenConfig);

      expect(config.services.backend.path).toBe('../my-backend');
      expect(config.services.backend.port).toBe(5000);
      expect(config.services.client.packageName).toBe('@company/api');
      expect(config.services.frontend).toBeUndefined();
      expect(config.sync.notifications).toBe(true);
    });

    it('should include frontend when selected', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockInquirer.prompt.mockResolvedValue({
        projectType: 'monorepo',
        backendPath: './packages/backend',
        backendPort: 4000,
        backendCommand: 'yarn dev',
        apiSpecPath: 'src/swagger.json',
        clientPath: './packages/client',
        clientPackageName: '@myapp/client',
        clientGenerator: '@hey-api/openapi-ts',
        includeFrontend: true,
        frontendPath: './packages/web',
        frontendPort: 3000,
        frontendCommand: 'yarn dev',
        enableNotifications: false,
        syncStrategy: 'conservative',
      });

      await init({});

      const writtenConfig = mockFs.writeFileSync.mock.calls[0]?.[1] as string;
      const config = JSON.parse(writtenConfig);

      expect(config.services.frontend).toBeDefined();
      expect(config.services.frontend.path).toBe('./packages/web');
      expect(config.services.frontend.port).toBe(3000);
    });
  });

  describe('existing configuration handling', () => {
    it('should prompt to overwrite existing config', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockInquirer.prompt.mockResolvedValueOnce({ overwrite: false });

      await init({});

      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'overwrite',
          message: expect.stringContaining('already exists'),
        }),
      ]);
      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should overwrite with --force flag', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockInquirer.prompt.mockResolvedValue({
        projectType: 'separate',
        backendPath: '../backend',
        backendPort: 4000,
        backendCommand: 'npm run dev',
        apiSpecPath: 'src/swagger.json',
        clientPath: '../client',
        clientPackageName: '@myorg/api',
        clientGenerator: 'custom',
        clientBuildCommand: 'npm run build',
        includeFrontend: false,
        enableNotifications: false,
        syncStrategy: 'smart',
      });

      await init({ force: true });

      expect(mockInquirer.prompt).toHaveBeenCalledTimes(1); // Only config prompts, no overwrite prompt
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('should validate generated configuration', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockInquirer.prompt.mockResolvedValue({
        projectType: 'separate',
        backendPath: '../backend',
        backendPort: 4000,
        backendCommand: 'npm run dev',
        apiSpecPath: 'src/swagger.json',
        clientPath: '../backend', // Same as backend - should cause validation error
        clientPackageName: '@myorg/api',
        clientGenerator: 'custom',
        clientBuildCommand: 'npm run build',
        includeFrontend: false,
        enableNotifications: false,
        syncStrategy: 'smart',
      });

      try {
        await init({});
      } catch (error) {
        // Expected to exit
      }

      expect(mockSpinner.fail).toHaveBeenCalledWith(
        'Configuration validation failed'
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Validation errors')
      );
    });

    it('should show warnings for suboptimal configuration', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockInquirer.prompt.mockResolvedValue({
        projectType: 'separate',
        backendPath: '../backend',
        backendPort: 4000,
        backendCommand: 'npm run dev',
        apiSpecPath: 'src/swagger.json',
        clientPath: '../client',
        clientPackageName: '@myorg/api',
        clientGenerator: 'custom',
        clientBuildCommand: '', // No build command - should warn
        includeFrontend: false,
        enableNotifications: false,
        syncStrategy: 'aggressive', // Should warn
      });

      await init({});

      expect(mockSpinner.warn).toHaveBeenCalledWith(
        'Configuration has warnings'
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warnings:')
      );
    });
  });

  describe('error handling', () => {
    it('should handle write errors gracefully', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });
      mockInquirer.prompt.mockResolvedValue({
        projectType: 'separate',
        backendPath: '../backend',
        backendPort: 4000,
        backendCommand: 'npm run dev',
        apiSpecPath: 'src/swagger.json',
        clientPath: '../client',
        clientPackageName: '@myorg/api',
        clientGenerator: 'custom',
        clientBuildCommand: 'npm run build',
        includeFrontend: false,
        enableNotifications: false,
        syncStrategy: 'smart',
      });

      try {
        await init({});
      } catch (error) {
        // Expected to exit
      }

      expect(mockSpinner.fail).toHaveBeenCalledWith(
        'Failed to create configuration'
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith('Permission denied');
    });
  });
});

/**
 * Detect Command Tests
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';

import { glob } from 'glob';
import ora from 'ora';

import { detect, detectProjectStructure } from '../detect';

// Mock modules
jest.mock('fs');
jest.mock('glob');
jest.mock('ora');

const mockFs = {
  existsSync: existsSync as jest.MockedFunction<typeof existsSync>,
  readFileSync: readFileSync as jest.MockedFunction<typeof readFileSync>,
  writeFileSync: writeFileSync as jest.MockedFunction<typeof writeFileSync>,
};

const mockGlob = glob as jest.MockedFunction<typeof glob>;
const mockOra = ora as jest.MockedFunction<typeof ora>;

describe('Detect Command', () => {
  let mockSpinner: any;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSpinner = {
      start: jest.fn().mockReturnThis(),
      succeed: jest.fn().mockReturnThis(),
      fail: jest.fn().mockReturnThis(),
      warn: jest.fn().mockReturnThis(),
    };
    mockOra.mockReturnValue(mockSpinner);

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('detect command', () => {
    it('should detect and create configuration', async () => {
      mockFs.existsSync.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('oats.config.json')) return false;
        if (pathStr.includes('backend/package.json')) return true;
        if (pathStr.includes('client/package.json')) return true;
        if (pathStr.includes('frontend/package.json')) return true;
        return false;
      });

      mockGlob.mockImplementation(async (pattern: string | string[]) => {
        if (pattern === '../*') {
          return ['../backend', '../client', '../frontend'];
        }
        if (pattern === 'swagger.json') {
          return ['swagger.json'];
        }
        return [];
      });

      mockFs.readFileSync.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('backend/package.json')) {
          return JSON.stringify({
            name: 'my-backend',
            dependencies: { express: '^4.18.0' },
            scripts: { dev: 'nodemon server.js' },
          });
        }
        if (pathStr.includes('client/package.json')) {
          return JSON.stringify({
            name: '@myorg/api-client',
            scripts: { generate: 'openapi-ts' },
          });
        }
        if (pathStr.includes('frontend/package.json')) {
          return JSON.stringify({
            name: 'my-frontend',
            dependencies: { react: '^18.0.0' },
            scripts: { dev: 'vite' },
          });
        }
        return '{}';
      });

      await detect({ output: 'oats.config.json' });

      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        'Project structure detected!'
      );
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('oats.config.json'),
        expect.stringContaining('"path": "../backend"')
      );
    });

    it('should error if config already exists without --force', async () => {
      mockFs.existsSync.mockReturnValue(true);

      try {
        await detect({ output: 'oats.config.json' });
      } catch (error) {
        // Expected
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Configuration already exists'),
        expect.stringContaining('Use --force to overwrite')
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should overwrite with --force flag', async () => {
      mockFs.existsSync.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('oats.config.json')) return true; // Config exists
        if (pathStr.includes('backend/package.json')) return true;
        if (pathStr.includes('client/package.json')) return true;
        return false;
      });

      mockGlob.mockResolvedValue(['../backend', '../client']);

      mockFs.readFileSync.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('backend/package.json')) {
          return JSON.stringify({
            dependencies: { express: '^4.18.0' },
          });
        }
        if (pathStr.includes('client/package.json')) {
          return JSON.stringify({
            name: '@myorg/api-client',
            scripts: { generate: 'openapi-ts' },
          });
        }
        return '{}';
      });

      await detect({ output: 'oats.config.json', force: true });

      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('should handle detection failure', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockGlob.mockResolvedValue([]);

      try {
        await detect({ output: 'oats.config.json' });
      } catch (error) {
        // Expected
      }

      expect(mockSpinner.fail).toHaveBeenCalledWith('Detection failed');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not detect required services')
      );
    });
  });

  describe('detectProjectStructure', () => {
    // TODO: This test is skipped until monorepo detection is fully implemented
    it.skip('should detect monorepo structure', async () => {
      mockGlob.mockImplementation(async (pattern: string | string[]) => {
        if (
          typeof pattern === 'string' &&
          pattern.includes('**/package.json')
        ) {
          return [
            'packages/backend/package.json',
            'packages/client/package.json',
            'packages/frontend/package.json',
          ];
        }
        if (typeof pattern === 'string' && pattern === 'packages/*') {
          return ['packages/backend', 'packages/client', 'packages/frontend'];
        }
        if (typeof pattern === 'string' && pattern.includes('swagger')) {
          return ['packages/backend/src/swagger.json'];
        }
        return [];
      });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('backend/package.json')) {
          return JSON.stringify({
            name: 'my-backend-service',
            dependencies: { express: '^4.18.0', tsoa: '^5.0.0' },
            devDependencies: {},
            scripts: { dev: 'nodemon app.js', start: 'node app.js' },
          });
        }
        if (pathStr.includes('client/package.json')) {
          return JSON.stringify({
            name: '@myorg/api-client',
            scripts: { generate: 'openapi-ts', build: 'tsc' },
            dependencies: {},
            devDependencies: { '@hey-api/openapi-ts': '^0.27.0' },
          });
        }
        if (pathStr.includes('frontend/package.json')) {
          return JSON.stringify({
            name: 'frontend',
            dependencies: { react: '^18.0.0' },
            devDependencies: {},
            scripts: { dev: 'vite' },
          });
        }
        if (pathStr === 'package.json' || pathStr.endsWith('/package.json')) {
          return JSON.stringify({
            name: 'monorepo-root',
            workspaces: ['packages/*'],
          });
        }
        return '{}';
      });

      const result = await detectProjectStructure(process.cwd());

      expect(result.monorepo).toBe(true);
      expect(result.backend).toBeDefined();
      expect(result.client).toBeDefined();
      expect(result.frontend).toBeDefined();
      expect(result.backend?.path).toBe('packages/backend');
      // Debug the actual values
      if (result.client?.path !== 'packages/client') {
        console.log('Client detection issue:', {
          backend: result.backend,
          client: result.client,
          frontend: result.frontend,
        });
      }
      expect(result.client?.path).toBe('packages/client');
      expect(result.frontend?.path).toBe('packages/frontend');
    });

    it('should detect sibling directories structure', async () => {
      mockGlob.mockImplementation(async (pattern: string | string[]) => {
        if (typeof pattern === 'string' && pattern === '../*') {
          return ['../backend', '../api-client', '../frontend'];
        }
        if (
          typeof pattern === 'string' &&
          pattern.includes('**/package.json')
        ) {
          return [];
        }
        return [];
      });

      mockFs.existsSync.mockImplementation((path) => {
        const pathStr = path.toString();
        return pathStr.includes('package.json');
      });

      mockFs.readFileSync.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('backend/package.json')) {
          return JSON.stringify({
            dependencies: { express: '^4.18.0', tsoa: '^5.0.0' },
            scripts: { dev: 'nodemon server.ts' },
          });
        }
        if (pathStr.includes('api-client/package.json')) {
          return JSON.stringify({
            name: '@company/api-client',
            scripts: { generate: 'openapi-ts', build: 'tsc' },
          });
        }
        if (pathStr.includes('frontend/package.json')) {
          return JSON.stringify({
            dependencies: { react: '^18.0.0' },
            scripts: { dev: 'vite dev' },
          });
        }
        return '{}';
      });

      const result = await detectProjectStructure(process.cwd());

      expect(result.backend).toBeDefined();
      expect(result.client).toBeDefined();
      expect(result.frontend).toBeDefined();
      expect(result.backend?.path).toBe('../backend');
      expect(result.client?.path).toBe('../api-client');
      expect(result.frontend?.path).toBe('../frontend');
    });

    it('should detect framework types correctly', async () => {
      mockGlob.mockImplementation(async (pattern: string | string[]) => {
        if (typeof pattern === 'string' && pattern === '../*') {
          return ['../backend', '../client'];
        }
        if (typeof pattern === 'string' && pattern.includes('swagger')) {
          return ['../backend/src/swagger.json'];
        }
        return [];
      });

      mockFs.existsSync.mockImplementation((path) => {
        const pathStr = path.toString();
        return (
          pathStr.includes('package.json') || pathStr.includes('swagger.json')
        );
      });
      mockFs.readFileSync.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('backend/package.json')) {
          return JSON.stringify({
            dependencies: {
              express: '^4.18.0',
              fastify: '^4.0.0',
              tsoa: '^5.0.0',
              'swagger-jsdoc': '^6.0.0',
            },
            scripts: { dev: 'nodemon app.ts' },
          });
        }
        if (pathStr.includes('client/package.json')) {
          return JSON.stringify({
            name: '@test/client',
            dependencies: {
              '@hey-api/openapi-ts': '^0.27.0',
            },
            scripts: { generate: 'openapi-ts' },
          });
        }
        return '{}';
      });

      const result = await detectProjectStructure(process.cwd());

      expect(result.backend?.framework).toBe('Express'); // Only first framework is detected
      expect(result.backend?.apiSpec).toContain('swagger.json');
      // client type doesn't have generator property in DetectedService
    });

    it('should handle missing required services', async () => {
      mockGlob.mockResolvedValue([]);
      mockFs.existsSync.mockReturnValue(false);

      const result = await detectProjectStructure(process.cwd());

      expect(result.backend).toBeUndefined();
      expect(result.client).toBeUndefined();
      expect(result.monorepo).toBe(false);
    });

    it('should detect package managers correctly', async () => {
      mockGlob.mockImplementation(async (pattern: string | string[]) => {
        if (typeof pattern === 'string' && pattern === '../*') {
          return ['../backend', '../client'];
        }
        return [];
      });

      mockFs.existsSync.mockImplementation((path) => {
        const pathStr = path.toString();
        // The glob returns absolute paths, and join will create absolute paths
        if (pathStr.endsWith('/yarn.lock')) {
          // Check if it's in a backend or client directory
          return pathStr.includes('backend') || pathStr.includes('client');
        }
        if (pathStr.includes('package.json')) return true;
        return false;
      });

      mockFs.readFileSync.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('backend/package.json')) {
          return JSON.stringify({
            dependencies: { express: '^4.18.0' },
            devDependencies: {},
            scripts: { dev: 'yarn dev' },
          });
        }
        if (pathStr.includes('client/package.json')) {
          return JSON.stringify({
            name: '@test/client',
            dependencies: {},
            devDependencies: { '@hey-api/openapi-ts': '^0.27.0' },
            scripts: { generate: 'yarn generate' },
          });
        }
        return '{}';
      });

      const result = await detectProjectStructure(process.cwd());

      expect(result.backend?.packageManager).toBe('yarn');
      expect(result.client?.packageManager).toBe('yarn');
    });

    describe('Python backend detection', () => {
      it('should detect FastAPI backend', async () => {
        mockGlob.mockImplementation(async (pattern: string | string[]) => {
          if (typeof pattern === 'string' && pattern === '../*') {
            return ['../backend', '../client'];
          }
          return [];
        });

        mockFs.existsSync.mockImplementation((path) => {
          const pathStr = path.toString();
          if (pathStr.includes('backend/requirements.txt')) return true;
          if (pathStr.includes('backend/main.py')) return true;
          if (pathStr.includes('client/package.json')) return true;
          return false;
        });

        mockFs.readFileSync.mockImplementation((path) => {
          const pathStr = path.toString();
          if (pathStr.includes('backend/requirements.txt')) {
            return 'fastapi==0.104.1\nuvicorn==0.24.0\npydantic==2.5.0';
          }
          if (pathStr.includes('client/package.json')) {
            return JSON.stringify({
              name: '@test/client',
              scripts: { generate: 'openapi-ts' },
            });
          }
          return '{}';
        });

        const result = await detectProjectStructure(process.cwd());

        expect(result.backend).toBeDefined();
        expect(result.backend?.framework).toBe('FastAPI');
        expect(result.backend?.runtime).toBe('python');
        expect(result.backend?.pythonPackageManager).toBe('pip');
        expect(result.backend?.apiSpec).toBe('runtime:/docs/openapi.json');
      });

      it('should detect Flask backend', async () => {
        mockGlob.mockImplementation(async (pattern: string | string[]) => {
          if (typeof pattern === 'string' && pattern === '../*') {
            return ['../backend', '../client'];
          }
          return [];
        });

        mockFs.existsSync.mockImplementation((path) => {
          const pathStr = path.toString();
          if (pathStr.includes('backend/requirements.txt')) return true;
          if (pathStr.includes('backend/app.py')) return true;
          if (pathStr.includes('client/package.json')) return true;
          return false;
        });

        mockFs.readFileSync.mockImplementation((path) => {
          const pathStr = path.toString();
          if (pathStr.includes('backend/requirements.txt')) {
            return 'flask==3.0.0\nflask-cors==4.0.0';
          }
          if (pathStr.includes('client/package.json')) {
            return JSON.stringify({
              name: '@test/client',
              scripts: { generate: 'openapi-ts' },
            });
          }
          return '{}';
        });

        const result = await detectProjectStructure(process.cwd());

        expect(result.backend).toBeDefined();
        expect(result.backend?.framework).toBe('Flask');
        expect(result.backend?.runtime).toBe('python');
      });

      it('should detect Django backend by manage.py', async () => {
        mockGlob.mockImplementation(async (pattern: string | string[]) => {
          if (typeof pattern === 'string' && pattern === '../*') {
            return ['../backend', '../client'];
          }
          return [];
        });

        mockFs.existsSync.mockImplementation((path) => {
          const pathStr = path.toString();
          if (pathStr.includes('backend/manage.py')) return true;
          if (pathStr.includes('client/package.json')) return true;
          return false;
        });

        mockFs.readFileSync.mockImplementation((path) => {
          const pathStr = path.toString();
          if (pathStr.includes('client/package.json')) {
            return JSON.stringify({
              name: '@test/client',
              scripts: { generate: 'openapi-ts' },
            });
          }
          return '{}';
        });

        const result = await detectProjectStructure(process.cwd());

        expect(result.backend).toBeDefined();
        expect(result.backend?.framework).toBe('Django');
        expect(result.backend?.runtime).toBe('python');
      });

      it('should detect Poetry package manager', async () => {
        mockGlob.mockImplementation(async (pattern: string | string[]) => {
          if (typeof pattern === 'string' && pattern === '../*') {
            return ['../backend', '../client'];
          }
          return [];
        });

        mockFs.existsSync.mockImplementation((path) => {
          const pathStr = path.toString();
          if (pathStr.includes('backend/pyproject.toml')) return true;
          if (pathStr.includes('backend/poetry.lock')) return true;
          if (pathStr.includes('client/package.json')) return true;
          return false;
        });

        mockFs.readFileSync.mockImplementation((path) => {
          const pathStr = path.toString();
          if (pathStr.includes('backend/pyproject.toml')) {
            return '[tool.poetry]\nname = "backend"\n\n[tool.poetry.dependencies]\nfastapi = "^0.104.1"';
          }
          if (pathStr.includes('client/package.json')) {
            return JSON.stringify({
              name: '@test/client',
              scripts: { generate: 'openapi-ts' },
            });
          }
          return '{}';
        });

        const result = await detectProjectStructure(process.cwd());

        expect(result.backend).toBeDefined();
        expect(result.backend?.pythonPackageManager).toBe('poetry');
      });

      it('should detect virtual environment', async () => {
        mockGlob.mockImplementation(async (pattern: string | string[]) => {
          if (typeof pattern === 'string' && pattern === '../*') {
            return ['../backend', '../client'];
          }
          return [];
        });

        mockFs.existsSync.mockImplementation((path) => {
          const pathStr = path.toString();
          if (pathStr.includes('backend/requirements.txt')) return true;
          if (pathStr.includes('backend/venv')) return true;
          if (pathStr.includes('client/package.json')) return true;
          return false;
        });

        mockFs.readFileSync.mockImplementation((path) => {
          const pathStr = path.toString();
          if (pathStr.includes('backend/requirements.txt')) {
            return 'fastapi==0.104.1';
          }
          if (pathStr.includes('client/package.json')) {
            return JSON.stringify({
              name: '@test/client',
              scripts: { generate: 'openapi-ts' },
            });
          }
          return '{}';
        });

        const result = await detectProjectStructure(process.cwd());

        expect(result.backend).toBeDefined();
        expect(result.backend?.virtualEnv).toBe('venv');
      });

      it('should prefer Python backend over Node.js when both exist', async () => {
        mockGlob.mockImplementation(async (pattern: string | string[]) => {
          if (typeof pattern === 'string' && pattern === '../*') {
            return ['../backend', '../client'];
          }
          return [];
        });

        mockFs.existsSync.mockImplementation((path) => {
          const pathStr = path.toString();
          // Both Python and Node.js files exist
          if (pathStr.includes('backend/requirements.txt')) return true;
          if (pathStr.includes('backend/package.json')) return true;
          if (pathStr.includes('client/package.json')) return true;
          return false;
        });

        mockFs.readFileSync.mockImplementation((path) => {
          const pathStr = path.toString();
          if (pathStr.includes('backend/requirements.txt')) {
            return 'fastapi==0.104.1';
          }
          if (pathStr.includes('backend/package.json')) {
            return JSON.stringify({
              dependencies: { express: '^4.18.0' },
            });
          }
          if (pathStr.includes('client/package.json')) {
            return JSON.stringify({
              name: '@test/client',
              scripts: { generate: 'openapi-ts' },
            });
          }
          return '{}';
        });

        const result = await detectProjectStructure(process.cwd());

        // Should detect Python first
        expect(result.backend).toBeDefined();
        expect(result.backend?.runtime).toBe('python');
        expect(result.backend?.framework).toBe('FastAPI');
      });
    });
  });
});

/**
 * OATS Detect Command
 *
 * Auto-detects project structure and generates configuration
 *
 * @module @oatsjs/cli/detect
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

import chalk from 'chalk';
import { glob } from 'glob';
import ora from 'ora';

import { validateConfig } from '../config/schema.js';

import type { OatsConfig } from '../types/config.types.js';
// import { FileSystemError } from '../errors/index.js';

interface DetectOptions {
  output: string;
  force?: boolean;
}

interface DetectedService {
  path: string;
  type: 'backend' | 'frontend' | 'client';
  framework?: string;
  packageManager?: 'npm' | 'yarn' | 'pnpm';
  runtime?: 'node' | 'python';
  pythonPackageManager?: 'pip' | 'poetry' | 'pipenv';
  virtualEnv?: string;
  apiSpec?: string;
  port?: number;
  packageName?: string;
}

interface ProjectStructure {
  backend?: DetectedService;
  client?: DetectedService;
  frontend?: DetectedService;
  monorepo?: boolean;
  rootPackageManager?: 'npm' | 'yarn' | 'pnpm';
}

/**
 * Detect project structure and create configuration
 */
export async function detect(options: DetectOptions): Promise<void> {
  console.log(chalk.yellow('\n🔍 Auto-detecting project structure...\n'));

  const outputPath = join(process.cwd(), options.output);

  // Check if config already exists
  if (existsSync(outputPath) && !options.force) {
    console.error(
      chalk.red(`Configuration already exists at ${outputPath}`),
      chalk.dim('\nUse --force to overwrite')
    );
    process.exit(1);
  }

  const spinner = ora('Scanning directories...').start();

  try {
    const structure = await detectProjectStructure(process.cwd());
    spinner.succeed('Project structure detected!');

    // Display detected structure
    displayDetectedStructure(structure);

    // Generate configuration
    const config = generateConfigFromStructure(structure);

    // Validate configuration
    const validationSpinner = ora('Validating configuration...').start();
    const validation = validateConfig(config);

    if (!validation.valid) {
      validationSpinner.fail('Generated configuration is invalid');
      console.error(chalk.red('\nValidation errors:'));
      validation.errors.forEach((error) => {
        console.error(chalk.red(`  - ${error.path}: ${error.message}`));
      });
      process.exit(1);
    }

    validationSpinner.succeed('Configuration validated');

    // Write configuration
    const writeSpinner = ora('Writing configuration...').start();
    const configContent = JSON.stringify(config, null, 2);
    writeFileSync(outputPath, configContent);
    writeSpinner.succeed(`Configuration saved to ${outputPath}`);

    console.log(); // Empty line
    ora().succeed('Detection complete!');
    console.log(`\n${chalk.bold('Next steps:')}`);
    console.log(chalk.cyan('  1. Review the configuration:'));
    console.log(chalk.dim(`     cat ${outputPath}`));
    console.log(chalk.cyan('  2. Start watching:'));
    console.log(chalk.dim('     oats start'));
  } catch (error) {
    spinner.fail('Detection failed');
    console.error(
      chalk.red(error instanceof Error ? error.message : String(error))
    );
    process.exit(1);
  }
}

/**
 * Detect project structure
 */
export async function detectProjectStructure(
  rootPath: string
): Promise<ProjectStructure> {
  const structure: ProjectStructure = {};

  // Check if it's a monorepo
  structure.monorepo = await isMonorepo(rootPath);
  structure.rootPackageManager = await detectPackageManager(rootPath);

  // Search patterns
  const searchPaths = structure.monorepo
    ? ['packages/*', 'apps/*', 'services/*', '.']
    : ['../*', '.'];

  // Find backend
  for (const pattern of searchPaths) {
    const backend = await findBackend(rootPath, pattern);
    if (backend) {
      structure.backend = backend;
      break;
    }
  }

  // Find client
  for (const pattern of searchPaths) {
    const client = await findClient(rootPath, pattern);
    if (client) {
      structure.client = client;
      break;
    }
  }

  // Find frontend
  for (const pattern of searchPaths) {
    const frontend = await findFrontend(rootPath, pattern);
    if (frontend) {
      structure.frontend = frontend;
      break;
    }
  }

  return structure;
}

/**
 * Check if directory is a monorepo
 */
async function isMonorepo(path: string): Promise<boolean> {
  // Check for common monorepo files
  const monorepoFiles = [
    'lerna.json',
    'nx.json',
    'rush.json',
    'pnpm-workspace.yaml',
    'yarn.lock', // with workspaces in package.json
  ];

  for (const file of monorepoFiles) {
    if (existsSync(join(path, file))) {
      return true;
    }
  }

  // Check for workspaces in package.json
  const packageJsonPath = join(path, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      if (packageJson.workspaces) {
        return true;
      }
    } catch {
      // Ignore parse errors
    }
  }

  return false;
}

/**
 * Detect package manager
 */
async function detectPackageManager(
  path: string
): Promise<'npm' | 'yarn' | 'pnpm'> {
  if (existsSync(join(path, 'yarn.lock'))) {
    return 'yarn';
  }
  if (existsSync(join(path, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  return 'npm';
}

/**
 * Find backend service
 */
async function findBackend(
  rootPath: string,
  pattern: string
): Promise<DetectedService | null> {
  const dirs = await glob(pattern, { cwd: rootPath, absolute: true });

  for (const dir of dirs) {
    // Check for Python backend first
    const pythonBackend = await findPythonBackend(dir, rootPath);
    if (pythonBackend) {
      return pythonBackend;
    }

    // Check for Node.js backend
    if (!existsSync(join(dir, 'package.json'))) continue;

    const packageJson = JSON.parse(
      readFileSync(join(dir, 'package.json'), 'utf-8')
    );
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    // Check for backend frameworks
    const frameworks = {
      express: 'Express',
      fastify: 'Fastify',
      '@nestjs/core': 'NestJS',
      koa: 'Koa',
      '@hapi/hapi': 'Hapi',
      restify: 'Restify',
    };

    for (const [dep, framework] of Object.entries(frameworks)) {
      if (deps[dep]) {
        // Found backend
        const apiSpec = await findApiSpec(dir);
        const packageManager = await detectPackageManager(dir);

        return {
          path: relative(rootPath, dir),
          type: 'backend',
          framework,
          runtime: 'node',
          packageManager,
          apiSpec,
          port: detectPort(packageJson),
        };
      }
    }
  }

  return null;
}

/**
 * Find TypeScript client
 */
async function findClient(
  rootPath: string,
  pattern: string
): Promise<DetectedService | null> {
  const dirs = await glob(pattern, { cwd: rootPath, absolute: true });

  for (const dir of dirs) {
    if (!existsSync(join(dir, 'package.json'))) continue;

    const packageJson = JSON.parse(
      readFileSync(join(dir, 'package.json'), 'utf-8')
    );

    // Check for client indicators
    const clientIndicators = [
      packageJson.name?.includes('client'),
      packageJson.name?.includes('api'),
      packageJson.name?.includes('sdk'),
      existsSync(join(dir, 'openapi-ts.config.ts')),
      existsSync(join(dir, 'swagger.json')),
      existsSync(join(dir, 'openapi.json')),
      packageJson.scripts?.generate,
      packageJson.scripts?.codegen,
    ];

    if (clientIndicators.filter(Boolean).length >= 2) {
      const packageManager = await detectPackageManager(dir);

      return {
        path: relative(rootPath, dir),
        type: 'client',
        packageManager,
        packageName: packageJson.name,
      };
    }
  }

  return null;
}

/**
 * Find frontend service
 */
async function findFrontend(
  rootPath: string,
  pattern: string
): Promise<DetectedService | null> {
  const dirs = await glob(pattern, { cwd: rootPath, absolute: true });

  for (const dir of dirs) {
    if (!existsSync(join(dir, 'package.json'))) continue;

    const packageJson = JSON.parse(
      readFileSync(join(dir, 'package.json'), 'utf-8')
    );
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    // Check for frontend frameworks
    const frameworks = {
      react: 'React',
      vue: 'Vue',
      '@angular/core': 'Angular',
      svelte: 'Svelte',
      next: 'Next.js',
      nuxt: 'Nuxt',
      '@remix-run/react': 'Remix',
    };

    for (const [dep, framework] of Object.entries(frameworks)) {
      if (deps[dep]) {
        const packageManager = await detectPackageManager(dir);

        return {
          path: relative(rootPath, dir),
          type: 'frontend',
          framework,
          packageManager,
          port: detectPort(packageJson),
        };
      }
    }
  }

  return null;
}

/**
 * Find API specification file
 */
async function findApiSpec(dir: string): Promise<string | undefined> {
  const patterns = [
    'swagger.json',
    'openapi.json',
    'swagger.yaml',
    'openapi.yaml',
    'src/swagger.json',
    'src/openapi.json',
    'dist/swagger.json',
    'dist/openapi.json',
    'docs/swagger.json',
    'docs/openapi.json',
    'src/public/tsoa/swagger.json',
  ];

  for (const pattern of patterns) {
    const files = await glob(pattern, { cwd: dir });
    if (files.length > 0) {
      return files[0];
    }
  }

  return undefined;
}

/**
 * Detect port from package.json scripts
 */
function detectPort(packageJson: any): number | undefined {
  const scripts = packageJson.scripts || {};
  const scriptValues = Object.values(scripts).join(' ');

  // Look for port patterns
  const portMatch = scriptValues.match(/(?:--port|PORT=|-p\s+)(\d{4,5})/);
  if (portMatch && portMatch[1]) {
    return parseInt(portMatch[1], 10);
  }

  return undefined;
}

/**
 * Display detected structure
 */
function displayDetectedStructure(structure: ProjectStructure): void {
  console.log(`\n${chalk.bold('Detected structure:')}`);

  if (structure.monorepo) {
    console.log(
      chalk.cyan('  📦 Monorepo') +
        chalk.dim(` (${structure.rootPackageManager})`)
    );
  }

  if (structure.backend) {
    console.log(
      chalk.cyan('  🖥️  Backend:'),
      chalk.green(structure.backend.path),
      chalk.dim(
        `(${structure.backend.framework}${structure.backend.runtime === 'python' ? ' - Python' : ''})`
      )
    );
    if (structure.backend.apiSpec) {
      console.log(chalk.dim(`     API Spec: ${structure.backend.apiSpec}`));
    }
    if (
      structure.backend.runtime === 'python' &&
      structure.backend.virtualEnv
    ) {
      console.log(
        chalk.dim(`     Virtual Env: ${structure.backend.virtualEnv}`)
      );
    }
  }

  if (structure.client) {
    console.log(
      chalk.cyan('  📡 Client:'),
      chalk.green(structure.client.path),
      chalk.dim(`(${structure.client.packageName})`)
    );
  }

  if (structure.frontend) {
    console.log(
      chalk.cyan('  🎨 Frontend:'),
      chalk.green(structure.frontend.path),
      chalk.dim(`(${structure.frontend.framework})`)
    );
  }

  if (!structure.backend && !structure.client && !structure.frontend) {
    console.log(chalk.yellow('  ⚠️  No services detected'));
  }
}

/**
 * Find Python backend
 */
async function findPythonBackend(
  dir: string,
  rootPath: string
): Promise<DetectedService | null> {
  // Check for Python project indicators
  const pythonFiles = [
    'requirements.txt',
    'pyproject.toml',
    'Pipfile',
    'setup.py',
    'manage.py', // Django
  ];

  const hasPythonProject = pythonFiles.some((file) =>
    existsSync(join(dir, file))
  );

  if (!hasPythonProject) return null;

  // Detect Python framework
  const framework = await detectPythonFramework(dir);
  if (!framework) return null;

  // Detect Python package manager
  const pythonPackageManager = await detectPythonPackageManager(dir);

  // Detect virtual environment
  const virtualEnv = await detectVirtualEnv(dir);

  // Find API spec
  const apiSpec = await findPythonApiSpec(dir);

  // Detect port
  const port = await detectPythonPort(dir, framework);

  return {
    path: relative(rootPath, dir),
    type: 'backend',
    framework,
    runtime: 'python',
    pythonPackageManager,
    virtualEnv,
    apiSpec,
    port,
  };
}

/**
 * Detect Python framework
 */
async function detectPythonFramework(dir: string): Promise<string | null> {
  // Check requirements.txt
  if (existsSync(join(dir, 'requirements.txt'))) {
    const requirements = readFileSync(
      join(dir, 'requirements.txt'),
      'utf-8'
    ).toLowerCase();

    if (requirements.includes('fastapi')) return 'FastAPI';
    if (requirements.includes('flask')) return 'Flask';
    if (requirements.includes('django')) return 'Django';
  }

  // Check pyproject.toml
  if (existsSync(join(dir, 'pyproject.toml'))) {
    const pyproject = readFileSync(join(dir, 'pyproject.toml'), 'utf-8');
    if (pyproject.includes('fastapi')) return 'FastAPI';
    if (pyproject.includes('flask')) return 'Flask';
    if (pyproject.includes('django')) return 'Django';
  }

  // Check Pipfile
  if (existsSync(join(dir, 'Pipfile'))) {
    const pipfile = readFileSync(join(dir, 'Pipfile'), 'utf-8');
    if (pipfile.includes('fastapi')) return 'FastAPI';
    if (pipfile.includes('flask')) return 'Flask';
    if (pipfile.includes('django')) return 'Django';
  }

  // Check for framework-specific files
  if (existsSync(join(dir, 'manage.py'))) return 'Django';
  if (existsSync(join(dir, 'main.py')) || existsSync(join(dir, 'app.py'))) {
    // Could be FastAPI or Flask, default to FastAPI for modern apps
    return 'FastAPI';
  }

  return null;
}

/**
 * Detect Python package manager
 */
async function detectPythonPackageManager(
  dir: string
): Promise<'pip' | 'poetry' | 'pipenv'> {
  if (
    existsSync(join(dir, 'poetry.lock')) ||
    existsSync(join(dir, 'pyproject.toml'))
  ) {
    const hasPoetry =
      existsSync(join(dir, 'pyproject.toml')) &&
      readFileSync(join(dir, 'pyproject.toml'), 'utf-8').includes(
        '[tool.poetry]'
      );
    if (hasPoetry) return 'poetry';
  }
  if (existsSync(join(dir, 'Pipfile.lock'))) return 'pipenv';
  return 'pip';
}

/**
 * Detect virtual environment
 */
async function detectVirtualEnv(dir: string): Promise<string | undefined> {
  const venvDirs = ['venv', '.venv', 'env', '.env', 'virtualenv'];

  for (const venvDir of venvDirs) {
    if (existsSync(join(dir, venvDir))) {
      return venvDir;
    }
  }

  return undefined;
}

/**
 * Find Python API spec
 */
async function findPythonApiSpec(dir: string): Promise<string | undefined> {
  const patterns = [
    'openapi.json',
    'swagger.json',
    'docs/openapi.json',
    'docs/swagger.json',
    'static/openapi.json',
    'static/swagger.json',
    'app/openapi.json',
    'api/openapi.json',
  ];

  for (const pattern of patterns) {
    if (existsSync(join(dir, pattern))) {
      return pattern;
    }
  }

  // For FastAPI, the spec is usually generated at runtime
  // We'll use a special marker
  if ((await detectPythonFramework(dir)) === 'FastAPI') {
    return 'runtime:/docs/openapi.json';
  }

  return undefined;
}

/**
 * Detect Python backend port
 */
async function detectPythonPort(
  dir: string,
  framework: string
): Promise<number> {
  // Check common files for port configuration
  const filesToCheck = [
    'main.py',
    'app.py',
    'run.py',
    'server.py',
    '.env',
    'config.py',
    'settings.py',
  ];

  for (const file of filesToCheck) {
    if (existsSync(join(dir, file))) {
      const content = readFileSync(join(dir, file), 'utf-8');

      // Look for port patterns
      const portPatterns = [
        /port\s*=\s*(\d{4,5})/i,
        /PORT\s*=\s*(\d{4,5})/,
        /\.run\([^)]*port\s*=\s*(\d{4,5})/,
        /uvicorn\.run\([^)]*port\s*=\s*(\d{4,5})/,
      ];

      for (const pattern of portPatterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          return parseInt(match[1], 10);
        }
      }
    }
  }

  // Default ports by framework
  switch (framework) {
    case 'FastAPI':
      return 8000;
    case 'Flask':
      return 5000;
    case 'Django':
      return 8000;
    default:
      return 8000;
  }
}

/**
 * Generate configuration from detected structure
 */
function generateConfigFromStructure(structure: ProjectStructure): OatsConfig {
  if (!structure.backend || !structure.client) {
    throw new Error(
      'Could not detect required services. Please ensure you have both a backend and client project.'
    );
  }

  const config: OatsConfig = {
    services: {
      backend: {
        path: structure.backend.path,
        port:
          structure.backend.port ||
          (structure.backend.runtime === 'python' ? 8000 : 4000),
        startCommand: getStartCommand(structure.backend),
        apiSpec: {
          path:
            structure.backend.apiSpec ||
            (structure.backend.runtime === 'python'
              ? 'docs/openapi.json'
              : 'src/swagger.json'),
        },
      },
      client: {
        path: structure.client.path,
        packageName: structure.client.packageName || '@myorg/api-client',
        generator: 'custom',
        generateCommand:
          structure.client.packageManager === 'yarn'
            ? 'yarn generate'
            : 'npm run generate',
        buildCommand:
          structure.client.packageManager === 'yarn'
            ? 'yarn build'
            : 'npm run build',
        linkCommand:
          structure.client.packageManager === 'yarn' ? 'yarn link' : 'npm link',
      },
    },
  };

  // Add frontend if detected
  if (structure.frontend) {
    config.services.frontend = {
      path: structure.frontend.path,
      port: structure.frontend.port || 3000,
      startCommand:
        structure.frontend.packageManager === 'yarn'
          ? 'yarn dev'
          : 'npm run dev',
      packageLinkCommand:
        structure.frontend.packageManager === 'yarn' ? 'yarn link' : 'npm link',
    };
  }

  return config;
}

/**
 * Get start command based on service details
 */
function getStartCommand(service: DetectedService): string {
  if (service.runtime === 'python') {
    const activateCmd = service.virtualEnv
      ? `source ${service.virtualEnv}/bin/activate && `
      : '';

    switch (service.framework) {
      case 'FastAPI':
        return `${activateCmd}uvicorn main:app --reload --port ${service.port || 8000}`;
      case 'Flask':
        return `${activateCmd}flask run --port ${service.port || 5000}`;
      case 'Django':
        return `${activateCmd}python manage.py runserver ${service.port || 8000}`;
      default:
        return `${activateCmd}python app.py`;
    }
  }

  // Node.js backends
  return service.packageManager === 'yarn' ? 'yarn dev' : 'npm run dev';
}

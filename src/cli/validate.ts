/**
 * OATS Validate Command
 *
 * Validates OATS configuration files
 *
 * @module @oatsjs/cli/validate
 */

import { existsSync, readFileSync } from 'fs';
import { join, resolve, basename } from 'path';

import chalk from 'chalk';

import { validateConfig } from '../config/schema.js';
import { loadConfigFromFile, findConfigFile } from '../config/loader.js';

import type { OatsConfig } from '../types/config.types.js';

interface ValidateOptions {
  config?: string;
  strict?: boolean;
}

interface PathCheck {
  name: string;
  path: string;
  required: boolean;
  exists?: boolean;
  absolutePath?: string;
}

/**
 * Validate OATS configuration
 */
export async function validate(options: ValidateOptions): Promise<void> {
  let configPath: string;
  let fullPath: string;

  if (options.config) {
    configPath = options.config;
    fullPath = join(process.cwd(), configPath);
  } else {
    const foundPath = findConfigFile();
    if (!foundPath) {
      console.error(chalk.red('\n❌ No configuration file found'));
      process.exit(1);
    }
    fullPath = foundPath;
    configPath = basename(foundPath);
  }

  console.log(chalk.yellow(`\n🔍 Validating ${configPath}...\n`));

  // Check if config file exists
  if (!existsSync(fullPath)) {
    console.error(chalk.red(`❌ Configuration file not found: ${configPath}`));
    console.log(chalk.dim('\nCreate a configuration with: oats init'));
    process.exit(1);
  }

  try {
    // Load configuration (supports both .json and .ts)
    const config = await loadConfigFromFile(fullPath);

    // Validate configuration schema
    const validation = validateConfig(config);

    if (!validation.valid) {
      console.error(chalk.red('❌ Configuration is invalid:\n'));
      validation.errors.forEach((error) => {
        console.error(chalk.red(`  • ${error.path}: ${error.message}`));
        if (error.value !== undefined) {
          console.error(
            chalk.dim(`    Current value: ${JSON.stringify(error.value)}`)
          );
        }
      });

      if (!options.strict) {
        console.log(chalk.dim('\nRun with --strict for additional checks'));
      }

      process.exit(1);
    }

    // Show warnings
    if (validation.warnings.length > 0) {
      console.warn(chalk.yellow('⚠️  Configuration warnings:\n'));
      validation.warnings.forEach((warning) => {
        console.warn(chalk.yellow(`  • ${warning.message}`));
        if (warning.suggestion) {
          console.warn(chalk.dim(`    💡 ${warning.suggestion}`));
        }
      });
    } else {
      console.log(chalk.green('✅ Configuration schema is valid!'));
    }

    // Check paths exist
    console.log(chalk.yellow('\n🔍 Checking service paths...\n'));
    const pathChecks = await checkPaths(config);
    displayPathChecks(pathChecks);

    // Strict mode checks
    let strictResults: any[] = [];
    if (options.strict) {
      console.log(chalk.yellow('\n🔍 Running strict validation...\n'));
      strictResults = await performStrictChecks(config);
      displayStrictResults(strictResults);
    }

    // Check for dependencies
    console.log(chalk.yellow('\n🔍 Checking dependencies...\n'));
    const depChecks = await checkDependencies(config);
    displayDependencyChecks(depChecks);

    // Final summary
    const hasErrors =
      pathChecks.some((p) => p.required && !p.exists) ||
      (options.strict && strictResults.some((r: any) => !r.passed));

    if (hasErrors) {
      console.log(chalk.red('\n❌ Validation completed with errors'));
      process.exit(1);
    } else if (
      validation.warnings.length > 0 ||
      pathChecks.some((p) => !p.exists)
    ) {
      console.log(chalk.yellow('\n⚠️  Validation completed with warnings'));
    } else {
      console.log(chalk.green('\n✅ Configuration is fully valid!'));
      console.log(chalk.dim('\nYou can now run: oats start'));
    }
  } catch (error) {
    console.error(chalk.red('❌ Failed to validate configuration:'));
    console.error(
      chalk.red(error instanceof Error ? error.message : String(error))
    );
    process.exit(1);
  }
}

/**
 * Check if configured paths exist
 */
async function checkPaths(config: OatsConfig): Promise<PathCheck[]> {
  const checks: PathCheck[] = [];

  // Backend path
  const backendPath = resolve(process.cwd(), config.services.backend.path);
  checks.push({
    name: 'Backend',
    path: config.services.backend.path,
    required: true,
    exists: existsSync(backendPath),
    absolutePath: backendPath,
  });

  // API spec path
  const apiSpecPath = resolve(
    backendPath,
    config.services.backend.apiSpec.path
  );
  checks.push({
    name: 'API Spec',
    path: join(
      config.services.backend.path,
      config.services.backend.apiSpec.path
    ),
    required: false,
    exists: existsSync(apiSpecPath),
    absolutePath: apiSpecPath,
  });

  // Client path
  const clientPath = resolve(process.cwd(), config.services.client.path);
  checks.push({
    name: 'Client',
    path: config.services.client.path,
    required: true,
    exists: existsSync(clientPath),
    absolutePath: clientPath,
  });

  // Frontend path (optional)
  if (config.services.frontend) {
    const frontendPath = resolve(process.cwd(), config.services.frontend.path);
    checks.push({
      name: 'Frontend',
      path: config.services.frontend.path,
      required: false,
      exists: existsSync(frontendPath),
      absolutePath: frontendPath,
    });
  }

  return checks;
}

/**
 * Display path check results
 */
function displayPathChecks(checks: PathCheck[]): void {
  checks.forEach(({ name, path, required, exists }) => {
    if (exists) {
      console.log(chalk.green(`✅ ${name}: ${path}`));
    } else if (required) {
      console.log(chalk.red(`❌ ${name}: ${path} (not found - required)`));
    } else {
      console.log(chalk.yellow(`⚠️  ${name}: ${path} (not found - optional)`));
    }
  });
}

/**
 * Perform strict validation checks
 */
async function performStrictChecks(
  config: OatsConfig
): Promise<StrictCheckResult[]> {
  const results: StrictCheckResult[] = [];

  // Check package.json files exist
  const paths = [
    config.services.backend.path,
    config.services.client.path,
    config.services.frontend?.path,
  ].filter(Boolean) as string[];

  for (const path of paths) {
    const packageJsonPath = resolve(process.cwd(), path, 'package.json');
    results.push({
      check: `package.json in ${path}`,
      passed: existsSync(packageJsonPath),
      message: existsSync(packageJsonPath)
        ? 'Found'
        : 'Missing package.json - is this a Node.js project?',
    });
  }

  // Check for start scripts
  for (const path of paths) {
    const packageJsonPath = resolve(process.cwd(), path, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        const hasDevScript =
          packageJson.scripts?.dev || packageJson.scripts?.start;
        results.push({
          check: `Dev script in ${path}`,
          passed: Boolean(hasDevScript),
          message: hasDevScript
            ? 'Found dev/start script'
            : 'No dev or start script found',
        });
      } catch {
        results.push({
          check: `Dev script in ${path}`,
          passed: false,
          message: 'Could not read package.json',
        });
      }
    }
  }

  // Check client package name matches
  const clientPackageJsonPath = resolve(
    process.cwd(),
    config.services.client.path,
    'package.json'
  );
  if (existsSync(clientPackageJsonPath)) {
    try {
      const packageJson = JSON.parse(
        readFileSync(clientPackageJsonPath, 'utf-8')
      );
      const nameMatches =
        packageJson.name === config.services.client.packageName;
      results.push({
        check: 'Client package name',
        passed: nameMatches,
        message: nameMatches
          ? 'Package name matches configuration'
          : `Package name mismatch: ${packageJson.name} !== ${config.services.client.packageName}`,
      });
    } catch {
      // Ignore
    }
  }

  return results;
}

interface StrictCheckResult {
  check: string;
  passed: boolean;
  message: string;
}

/**
 * Display strict check results
 */
function displayStrictResults(results: StrictCheckResult[]): void {
  results.forEach(({ check, passed, message }) => {
    const icon = passed ? chalk.green('✅') : chalk.red('❌');
    const color = passed ? chalk.green : chalk.red;
    console.log(`${icon} ${check}: ${color(message)}`);
  });
}

/**
 * Check dependencies
 */
async function checkDependencies(
  config: OatsConfig
): Promise<DependencyCheck[]> {
  const checks: DependencyCheck[] = [];

  // Check if generator is installed (for non-custom generators)
  if (config.services.client.generator !== 'custom') {
    const clientPath = resolve(process.cwd(), config.services.client.path);
    const packageJsonPath = resolve(clientPath, 'package.json');

    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        const deps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };
        const hasGenerator = config.services.client.generator in deps;

        checks.push({
          name: config.services.client.generator,
          type: 'generator',
          installed: hasGenerator,
          required: true,
        });
      } catch {
        checks.push({
          name: config.services.client.generator,
          type: 'generator',
          installed: false,
          required: true,
        });
      }
    }
  }

  return checks;
}

interface DependencyCheck {
  name: string;
  type: string;
  installed: boolean;
  required: boolean;
}

/**
 * Display dependency check results
 */
function displayDependencyChecks(checks: DependencyCheck[]): void {
  if (checks.length === 0) {
    console.log(chalk.dim('No specific dependencies to check'));
    return;
  }

  checks.forEach(({ name, type, installed, required }) => {
    if (installed) {
      console.log(chalk.green(`✅ ${name} (${type})`));
    } else if (required) {
      console.log(chalk.red(`❌ ${name} (${type}) - not installed`));
    } else {
      console.log(chalk.yellow(`⚠️  ${name} (${type}) - not installed`));
    }
  });
}

/**
 * Environment Variable Manager for OATS
 * 
 * Handles framework detection and environment variable injection
 * for seamless backend URL configuration across different frontend frameworks
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Logger } from '../../utils/logger.js';
import type { RuntimeConfig } from '../../types/config.types.js';

export interface FrameworkEnvConfig {
  framework: string;
  envPrefix: string;
  description: string;
}

export class EnvManager {
  private logger: Logger;
  
  // Framework configurations with their environment variable prefixes
  private static readonly FRAMEWORK_CONFIGS: FrameworkEnvConfig[] = [
    { framework: 'vite', envPrefix: 'VITE_', description: 'Vite' },
    { framework: 'create-react-app', envPrefix: 'REACT_APP_', description: 'Create React App' },
    { framework: 'vue-cli', envPrefix: 'VUE_APP_', description: 'Vue CLI' },
    { framework: 'next', envPrefix: 'NEXT_PUBLIC_', description: 'Next.js' },
    { framework: 'nuxt', envPrefix: 'NUXT_PUBLIC_', description: 'Nuxt' },
    { framework: 'angular', envPrefix: 'NG_', description: 'Angular' },
    { framework: 'svelte', envPrefix: 'VITE_', description: 'SvelteKit' }, // SvelteKit uses Vite
    { framework: 'remix', envPrefix: 'REMIX_', description: 'Remix' },
  ];

  constructor() {
    this.logger = new Logger('EnvManager');
  }

  /**
   * Detect frontend framework from package.json
   */
  detectFramework(projectPath: string): string {
    try {
      const packageJsonPath = join(projectPath, 'package.json');
      if (!existsSync(packageJsonPath)) {
        return 'unknown';
      }

      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      const deps = { 
        ...packageJson.dependencies, 
        ...packageJson.devDependencies 
      };

      // Check for framework indicators
      if (deps['next']) return 'next';
      if (deps['nuxt'] || deps['nuxt3']) return 'nuxt';
      if (deps['@angular/core']) return 'angular';
      if (deps['@sveltejs/kit']) return 'svelte';
      if (deps['@remix-run/react']) return 'remix';
      if (deps['@vitejs/plugin-react'] || deps['vite']) return 'vite';
      if (deps['react-scripts']) return 'create-react-app';
      if (deps['@vue/cli-service']) return 'vue-cli';
      
      // Check scripts for additional hints
      const scripts = packageJson.scripts || {};
      if (scripts.dev?.includes('vite') || scripts.start?.includes('vite')) return 'vite';
      if (scripts.start?.includes('react-scripts')) return 'create-react-app';
      if (scripts.serve?.includes('vue-cli-service')) return 'vue-cli';
      
    } catch (error) {
      this.logger.debug(`Could not detect framework: ${error}`);
    }
    
    return 'unknown';
  }

  /**
   * Get the appropriate env prefix for a framework
   */
  private getEnvPrefix(framework: string): string {
    const config = EnvManager.FRAMEWORK_CONFIGS.find(f => f.framework === framework);
    return config?.envPrefix || '';
  }

  /**
   * Generate OATS environment variables for frontend service
   */
  generateFrontendEnvVars(
    frontendPath: string, 
    runtimeConfig: RuntimeConfig
  ): Record<string, string> {
    // Construct backend URL from config
    const backendConfig = runtimeConfig.services.backend;
    const backendUrl = backendConfig.port 
      ? `http://localhost:${backendConfig.port}`
      : 'http://localhost:8000';

    // Detect framework
    const framework = this.detectFramework(frontendPath);
    const envPrefix = this.getEnvPrefix(framework);
    
    // Build environment variables
    const envVars: Record<string, string> = {
      // Generic OATS variables (always included)
      OATS_MODE: 'true',
      OATS_BACKEND_BASE_URL: backendUrl,
      NODE_ENV: 'development',
    };

    // Framework-specific variables
    if (envPrefix) {
      envVars[`${envPrefix}OATS_BACKEND_BASE_URL`] = backendUrl;
      envVars[`${envPrefix}OATS_MODE`] = 'true';
      
      // Add common API URL patterns for convenience
      envVars[`${envPrefix}API_URL`] = backendUrl;
      envVars[`${envPrefix}API_BASE_URL`] = backendUrl;
      envVars[`${envPrefix}BACKEND_URL`] = backendUrl;
      envVars[`${envPrefix}BACKEND_BASE_URL`] = backendUrl;
    }

    // TODO: Add support for additional services (agent, worker, etc.)
    // when they are added to the ServicesConfig type

    // Log environment setup
    const frameworkDesc = this.getFrameworkDescription(framework);
    this.logger.info(`🌍 Setting up environment for ${frameworkDesc}`);
    this.logger.info(`   Backend URL: ${backendUrl}`);
    if (envPrefix) {
      this.logger.info(`   Environment prefix: ${envPrefix}*`);
    }
    this.logger.debug('Environment variables:', envVars);

    return envVars;
  }

  /**
   * Get a user-friendly framework description
   */
  getFrameworkDescription(framework: string): string {
    const config = EnvManager.FRAMEWORK_CONFIGS.find(f => f.framework === framework);
    return config?.description || 'Unknown Framework';
  }

  /**
   * Generate environment variables for any service type
   * This can be extended for backend services, workers, etc.
   */
  generateServiceEnvVars(
    serviceType: 'frontend' | 'backend' | 'worker',
    servicePath: string,
    runtimeConfig: RuntimeConfig
  ): Record<string, string> {
    switch (serviceType) {
      case 'frontend':
        return this.generateFrontendEnvVars(servicePath, runtimeConfig);
      
      case 'backend':
        // Backend services might need database URLs, service URLs, etc.
        return {
          NODE_ENV: 'development',
          OATS_MODE: 'true',
          // Add more backend-specific env vars as needed
        };
        
      case 'worker':
        // Worker services might need queue URLs, backend URLs, etc.
        return {
          NODE_ENV: 'development',
          OATS_MODE: 'true',
          BACKEND_URL: `http://localhost:${runtimeConfig.services.backend?.port || 8000}`,
          // Add more worker-specific env vars as needed
        };
        
      default:
        return {};
    }
  }
}

// Export singleton instance
export const envManager = new EnvManager();
/**
 * Example OATS TypeScript Configuration
 * 
 * This demonstrates how to use TypeScript for OATS configuration
 * with full type safety and IntelliSense support.
 */

import { defineConfig } from '@tryloop/oats';

export default defineConfig({
  services: {
    backend: {
      path: '../backend',
      port: 4000,
      startCommand: 'npm run dev',
      apiSpec: {
        path: 'swagger.json',
        watch: ['src/**/*.controller.ts']
      },
      env: {
        NODE_ENV: 'development',
        PORT: '4000'
      }
    },
    client: {
      path: '../ts-client',
      packageName: '@mycompany/api-client',
      generator: '@hey-api/openapi-ts',
      buildCommand: 'npm run build',
      env: {
        NODE_ENV: 'development'
      }
    },
    frontend: {
      path: '../frontend',
      port: 3000,
      startCommand: 'npm run dev',
      env: {
        REACT_APP_API_URL: 'http://localhost:4000'
      }
    }
  },
  sync: {
    strategy: 'smart',
    debounceMs: 500,
    runInitialGeneration: true,
    autoLink: true,
    showStepDurations: true
  },
  log: {
    level: 'info',
    quiet: false,
    file: './oats.log'
  }
});
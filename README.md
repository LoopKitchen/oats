# 🌾 OATS - OpenAPI TypeScript Sync

> Automatically sync OpenAPI specs to TypeScript clients. No manual steps, just real-time updates.

[![npm version](https://img.shields.io/npm/v/@tryloop/oats.svg)](https://www.npmjs.com/package/@tryloop/oats)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/@tryloop/oats.svg)](https://nodejs.org)

## 🚀 Quick Start

```bash
# Install
npm install -D @tryloop/oats

# Initialize config
npx oats init

# Start development
npx oats start
```

## 🎯 What is OATS?

OATS eliminates the manual 6-step workflow of syncing OpenAPI changes:
1. ~~Wait for backend to regenerate OpenAPI spec~~
2. ~~Copy spec to client generator~~
3. ~~Run generator~~
4. ~~Build client~~
5. ~~Link to frontend~~
6. ~~Restart frontend~~

**With OATS:** Change your API → Everything syncs automatically ✨

## 📋 Configuration

OATS supports multiple configuration formats:

### JSON Configuration
```json
{
  "$schema": "node_modules/@tryloop/oats/schema/oats.schema.json",
  "services": {
    "backend": {
      "path": "./backend",
      "port": 8000,
      "startCommand": "npm run dev",
      "apiSpec": {
        "path": "/api/openapi.json"
      }
    },
    "client": {
      "path": "./api-client",
      "packageName": "@myorg/api-client",
      "generator": "@hey-api/openapi-ts"
    },
    "frontend": {
      "path": "./frontend",
      "port": 3000,
      "startCommand": "npm run dev"
    }
  }
}
```

### TypeScript Configuration
```typescript
import { defineConfig } from '@tryloop/oats'

export default defineConfig({
  services: {
    backend: {
      path: './backend',
      port: 8000,
      startCommand: 'npm run dev',
      apiSpec: {
        path: '/api/openapi.json'
      }
    },
    client: {
      path: './api-client',
      packageName: '@myorg/api-client',
      generator: '@hey-api/openapi-ts'
    },
    frontend: {
      path: './frontend',
      port: 3000,
      startCommand: 'npm run dev'
    }
  }
})
```

### JavaScript Configuration
```javascript
const { defineConfig } = require('@tryloop/oats')

module.exports = defineConfig({
  // Same structure as TypeScript config
})
```

## 🌐 Supported Technologies

### Backend Frameworks
| Language | Frameworks | OpenAPI Support |
|----------|-----------|-----------------|
| **Node.js** | [Express](https://expressjs.com/), [Fastify](https://www.fastify.io/), [NestJS](https://nestjs.com/), [Koa](https://koajs.com/), [Hapi](https://hapi.dev/) | Static files or runtime generation |
| **Python** | [FastAPI](https://fastapi.tiangolo.com/), [Flask](https://flask.palletsprojects.com/), [Django REST](https://www.django-rest-framework.org/) | Runtime endpoints (e.g., `/openapi.json`) |

### Frontend Frameworks
All major frameworks: [React](https://react.dev/), [Vue](https://vuejs.org/), [Angular](https://angular.io/), [Svelte](https://svelte.dev/), [Next.js](https://nextjs.org/), [Nuxt](https://nuxt.com/), [Remix](https://remix.run/)

### TypeScript Client Generators
- [@hey-api/openapi-ts](https://github.com/hey-api/openapi-ts) (Recommended)
- [swagger-typescript-api](https://github.com/acacode/swagger-typescript-api)
- [openapi-generator-cli](https://github.com/OpenAPITools/openapi-generator-cli)
- Custom generators (via `generateCommand`)

## 🔧 CLI Commands

| Command | Description | Options |
|---------|-------------|---------|
| `oats start` | Start all services with auto-sync | `--config`, `--quiet`, `--init-gen` |
| `oats init` | Create configuration interactively | `--force`, `--yes` |
| `oats validate` | Validate configuration file | `--config` |
| `oats detect` | Auto-detect project structure | - |

## 🎨 Key Features

### 🔄 Real-time Synchronization
- **File watching** with intelligent debouncing
- **Smart change detection** - ignores formatting changes
- **Hash-based caching** - skip unnecessary regeneration
- **Concurrent sync prevention** - no duplicate operations

### 🛠️ Developer Experience
- **Auto port management** - kills conflicting processes
- **Cross-platform support** - Windows, macOS, Linux
- **Config hot-reload** - changes restart services automatically
- **IntelliSense support** - JSON schema for autocompletion
- **Multiple config formats** - JSON, JS, or TypeScript

### 🚀 Performance
- **45% faster sync** than manual process
- **Incremental builds** when possible
- **Parallel service startup**
- **Efficient polling** for runtime API specs

## 📚 Examples

### Python FastAPI + React
```json
{
  "services": {
    "backend": {
      "path": "../backend",
      "port": 8000,
      "runtime": "python",
      "python": {
        "virtualEnv": ".venv"
      },
      "startCommand": ".venv/bin/uvicorn main:app --reload",
      "apiSpec": {
        "path": "/openapi.json"
      }
    },
    "client": {
      "path": "../api-client",
      "packageName": "@myapp/api",
      "generator": "@hey-api/openapi-ts"
    },
    "frontend": {
      "path": "./",
      "port": 3000,
      "startCommand": "npm start"
    }
  }
}
```

### NestJS + Next.js Monorepo
```json
{
  "services": {
    "backend": {
      "path": "./apps/api",
      "port": 3333,
      "startCommand": "nx serve api",
      "apiSpec": {
        "path": "swagger.json"
      }
    },
    "client": {
      "path": "./packages/api-client",
      "packageName": "@myapp/api-client",
      "generator": "custom",
      "generateCommand": "yarn openapi-ts"
    },
    "frontend": {
      "path": "./apps/web",
      "port": 4200,
      "startCommand": "nx serve web"
    }
  }
}
```

## 📖 Configuration Reference

### Service Configuration
| Property | Description | Required |
|----------|-------------|----------|
| `path` | Path to service directory | ✅ |
| `port` | Port number (backend/frontend) | ⚠️ |
| `startCommand` | Command to start service | ✅ |
| `runtime` | `"node"` or `"python"` | ❌ |
| `apiSpec.path` | Path to OpenAPI spec | ✅ |

⚠️ Port is required for backend/frontend services, but not for client

### Sync Options
| Option | Default | Description |
|--------|---------|-------------|
| `strategy` | `"smart"` | `"smart"` or `"aggressive"` |
| `debounceMs` | `1000` | Delay before regenerating |
| `autoLink` | `true` | Auto-link packages |
| `pollingInterval` | `5000` | For runtime API specs |

### Log Options
| Option | Default | Description |
|--------|---------|-------------|
| `level` | `"info"` | `"debug"`, `"info"`, `"warn"`, `"error"` |
| `quiet` | `false` | Suppress output |
| `file` | - | Optional log file path |

## 🛡️ Troubleshooting

### Port conflicts
OATS automatically handles port conflicts. To disable:
```json
{
  "services": {
    "backend": {
      "env": {
        "OATS_AUTO_KILL_PORTS": "false"
      }
    }
  }
}
```

### Client not updating
1. Check package is linked: `npm ls @myorg/api-client`
2. For Vite: Exclude from optimization in `vite.config.ts`
3. Ensure `packageName` matches your client's `package.json`

### Command not found
Use npx or add to scripts:
```json
{
  "scripts": {
    "dev:sync": "oats start"
  }
}
```

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

```bash
# Clone repo
git clone https://github.com/tryloop/oats.git

# Install dependencies
yarn install

# Run tests
yarn test

# Start development
yarn dev
```

## 📄 License

MIT © [Hari Shekhar](https://github.com/shekhardtu)

---

<p align="center">
  <a href="https://github.com/tryloop/oats">GitHub</a> •
  <a href="https://www.npmjs.com/package/@tryloop/oats">npm</a> •
  <a href="https://github.com/tryloop/oats/issues">Issues</a>
</p>
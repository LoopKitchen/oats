# 🌾 OATS - OpenAPI TypeScript Sync

> Stop manually syncing your OpenAPI specs with TypeScript clients. OATS watches your backend API changes and automatically regenerates TypeScript clients in real-time.

[![npm version](https://img.shields.io/npm/v/@tryloop/oats.svg)](https://www.npmjs.com/package/@tryloop/oats)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/@tryloop/oats.svg)](https://nodejs.org)

## 🔥 Features

- **🔄 Real-time Sync**: Automatically syncs OpenAPI changes to TypeScript clients
- **🚀 Zero Manual Steps**: No more copy-paste workflows
- **🔌 Port Conflict Resolution**: Automatically frees up ports when needed
- **📦 Multiple Generators**: Support for any OpenAPI TypeScript generator
- **🛠️ Smart Defaults**: Minimal configuration required
- **📊 Intelligent Watching**: Only rebuilds when necessary
- **🔗 Auto-linking**: Seamlessly links packages in monorepos
- **🎯 Framework Agnostic**: Works with React, Vue, Angular, etc.
- **⚡ 45% Faster Sync**: Optimized performance with incremental builds
- **🔍 Smart Polling**: Efficient polling for runtime-generated API specs
- **🧠 Hash-based Caching**: Skip unnecessary regeneration with SHA-256 comparison
- **📈 Performance Tracking**: Optional timing display for each sync step

## 🎯 The Problem

You're building a TypeScript full-stack app with:
- A backend (Node.js or Python) that generates OpenAPI/Swagger specs
- A TypeScript client generated from those specs
- A frontend that uses the TypeScript client

Every time you change your backend API, you need to:
1. Wait for the backend to regenerate the OpenAPI spec
2. Manually copy it to your client generator
3. Run the generator
4. Build the client
5. Link it to your frontend
6. Restart your frontend

**That's 6 manual steps for every API change!** 😱

## ✨ The Solution: OATS

OATS automates this entire workflow. Just run:

```bash
npx @tryloop/oats start
```

Now when you change your backend API, OATS automatically:
- ✅ Detects the OpenAPI spec change
- ✅ Copies it to your client project
- ✅ Runs your generator
- ✅ Builds the client
- ✅ Links it to your frontend
- ✅ Your frontend hot-reloads with the new types!

## 🌐 Supported Technologies

### Backend Frameworks
- **Node.js**: Express, Fastify, NestJS, Koa, Hapi, Restify
- **Python**: FastAPI, Flask, Django (with DRF)

### Frontend Frameworks
- React, Vue, Angular, Svelte, Next.js, Nuxt, Remix

### TypeScript Client Generators
- Custom generators (recommended)
- @hey-api/openapi-ts
- swagger-typescript-api
- openapi-generator-cli

## 🚀 Quick Start

### 1. Install OATS

```bash
# In your frontend project (or monorepo root)
npm install --save-dev @tryloop/oats
# or
yarn add -D @tryloop/oats
```

### 2. Create Configuration

Create `oats.config.json` in your project root:

```json
{
  "services": {
    "backend": {
      "path": "./backend",
      "port": 8000,
      "startCommand": "npm run dev",
      "apiSpec": {
        "path": "/api/openapi.json"  // Runtime endpoint (recommended)
      }
    },
    "client": {
      "path": "./api-client",
      "generator": "@hey-api/openapi-ts",
      "packageName": "@myorg/api-client"
    },
    "frontend": {
      "path": "./frontend",
      "port": 3000,
      "startCommand": "npm run dev"
    }
  }
}
```

**Minimal config example** (OATS uses smart defaults for everything else):
```json
{
  "services": {
    "backend": {
      "path": "./backend",
      "startCommand": "npm run dev",
      "apiSpec": { "path": "/api/openapi.json" }
    },
    "client": {
      "path": "./api-client",
      "generator": "@hey-api/openapi-ts"
    }
  }
}
```

**Note:** Frontend configuration is optional! If you're running @tryloop/oats from your frontend project, it will just sync the backend and client without starting another frontend server.

### Why `port` and `startCommand` are required for frontend

When you do configure a frontend service, both `port` and `startCommand` are **required** because:
- Different frameworks use different default ports (React: 3000, Vite: 5173, Angular: 4200)
- Different frameworks use different start commands (`npm start`, `yarn dev`, `ng serve`)
- This ensures OATS knows exactly how to start and monitor your frontend

### 3. Add Script to package.json

```json
{
  "scripts": {
    "dev": "vite",
    "dev:oats": "oats start"    // Add this
  }
}
```

### 4. Start Development

```bash
yarn dev:oats
```

That's it! Your entire stack is now running with automatic API synchronization.

## 📦 Installation

```bash
# npm
npm install --save-dev @tryloop/oats

# yarn
yarn add -D @tryloop/oats

# pnpm
pnpm add -D @tryloop/oats
```

## 🎨 Features

### 🧠 Smart Change Detection
OATS uses intelligent comparison algorithms to detect meaningful changes in your OpenAPI specs:
- ✅ New endpoints or schemas
- ✅ Modified request/response types
- ✅ Changed authentication requirements
- ❌ Ignores formatting or property reordering

### 🔄 Complete Automation
1. **Watches** your OpenAPI/Swagger files
2. **Detects** meaningful changes
3. **Copies** swagger.json to client directory
4. **Generates** TypeScript clients
5. **Builds** the client package
6. **Links** to your frontend projects
7. **Triggers** frontend hot-reload via HMR

### 🎯 Developer Experience
- **Port-based service detection** - More reliable than log parsing
- **Automatic port conflict resolution** - Kills conflicting processes
- **Colored logs** for easy tracking
- **Clear change reporting** - know exactly what changed
- **Error recovery** - automatic retry with exponential backoff
- **Concurrent sync prevention** - No duplicate operations
- **Desktop notifications** (optional)

### 🔧 Flexible Configuration
Works with any OpenAPI client generator:
- `@hey-api/openapi-ts`
- `swagger-typescript-api`
- `openapi-generator-cli`
- Custom generators

## 📋 Configuration

### Complete Configuration Reference

```json
{
  "services": {
    "backend": {
      "path": "../backend",           // Path to backend (relative or absolute)
      "port": 4000,                   // Backend dev server port (optional)
      "startCommand": "yarn dev",     // Command to start backend
      "runtime": "node",              // Runtime: "node" (default) or "python"
      "python": {                     // Python-specific config (only if runtime is "python")
        "virtualEnv": "venv",         // Virtual environment directory
        "packageManager": "pip",      // Package manager: "pip", "poetry", or "pipenv"
        "executable": "python"        // Python executable (default: "python")
      },
      "apiSpec": {
        "path": "src/swagger.json"    // Path to OpenAPI spec (relative to backend)
      }
    },
    "client": {
      "path": "../api-client",        // Path to TypeScript client project
      "packageName": "@myorg/api",    // NPM package name of the client
      "generator": "custom",           // Generator type (see below)
      "generateCommand": "yarn generate",  // Command to generate client
      "buildCommand": "yarn build",        // Command to build client
      "linkCommand": "yarn link"           // Command to link for local dev
    },
    "frontend": {                      // OPTIONAL - only if you want @tryloop/oats to start it
      "path": ".",                    // Path to frontend
      "port": 5173,                   // REQUIRED - Must match your dev server port
      "startCommand": "yarn dev",     // REQUIRED - Your dev server command
      "packageLinkCommand": "yarn link"  // Command to link packages
    }
  },
  "sync": {                           // OPTIONAL - defaults shown below
    "strategy": "smart",             // "smart" or "always" - smart skips if no changes
    "debounceMs": 1000,              // Wait time before regenerating (ms)
    "autoLink": true,                // Automatically link packages after generation
    "notifications": false,          // Desktop notifications for sync events
    "retryAttempts": 3,              // Retry failed operations
    "retryDelayMs": 2000,            // Delay between retries (ms)
    "runInitialGeneration": false,   // Generate client on startup
    "ignore": ["**/node_modules/**"] // Paths to ignore in file watching
  },
  "log": {                           // OPTIONAL - logging configuration
    "level": "info",                // Log level: debug, info, warn, error
    "colors": true,                 // Use colored output
    "timestamps": false,            // Show timestamps in logs
    "showServiceOutput": true,      // Show backend/frontend console output
    "quiet": false,                 // Quiet mode - only essential messages
    "file": "./oats.log"           // Optional log file path
  }
}
```

### Port Conflict Handling

OATS automatically handles port conflicts by default. When a port is already in use:
1. Detects the conflicting process
2. Kills the process to free the port
3. Starts your service on the freed port

To disable automatic port killing:
```json
{
  "sync": {
    "autoKillConflictingPorts": false  // Default: true
  }
}
```

### Performance Options

Enable performance tracking and optimizations:
```json
{
  "sync": {
    "showStepDurations": true,    // Show timing for each sync step
    "pollingInterval": 3000       // Polling interval for runtime specs (ms)
  }
}
```

- **showStepDurations**: Display how long each step takes (detection, generation, build, linking)
- **pollingInterval**: For runtime API specs (like FastAPI), how often to check for changes (default: 5000ms)

### Python Backend Notes

For Python backends like FastAPI that generate OpenAPI specs at runtime:
- Use runtime endpoints for the API spec path (recommended)
- OATS will fetch the spec from the running server
- Make sure your backend is configured to expose the OpenAPI spec

Example for FastAPI:
```json
{
  "apiSpec": {
    "path": "/openapi.json"  // Fetched from http://localhost:8000/openapi.json
  }
}
```

### Minimal Configuration

If you're running @tryloop/oats from your frontend project, here's the minimal config:

```json
{
  "services": {
    "backend": {
      "path": "../backend",
      "startCommand": "yarn dev",
      "apiSpec": {
        "path": "src/swagger.json"
      }
    },
    "client": {
      "path": "../api-client",
      "packageName": "@myorg/api-client",
      "generator": "custom",
      "generateCommand": "yarn generate",
      "buildCommand": "yarn build"
    }
  }
}
```

### Generator Types

#### Using Custom Commands (Recommended)
```json
{
  "client": {
    "generator": "custom",
    "generateCommand": "yarn generate",  // Your existing generate command
    "buildCommand": "yarn build"
  }
}
```

#### Using @hey-api/openapi-ts
```json
{
  "client": {
    "generator": "@hey-api/openapi-ts",
    "generatorConfig": {
      "input": "./swagger.json",
      "output": "./src",
      "client": "axios"
    }
  }
}
```

## 🛠️ CLI Commands

### `@tryloop/oats start`
Start all services with automatic synchronization.

```bash
@tryloop/oats start [options]

Options:
  --init-gen        Run initial client generation on startup
  -c, --config      Path to config file (default: oats.config.json)
  --quiet           Quiet mode - only show essential messages
  --no-colors       Disable colored output
```

**Examples:**
```bash
# Start with default config
@tryloop/oats start

# Generate client before starting (useful for first run)
@tryloop/oats start --init-gen

# Use custom config file
@tryloop/oats start --config my-oats.config.json

# Quiet mode - only @tryloop/oats messages, no service output
@tryloop/oats start --quiet

# Disable colors
@tryloop/oats start --no-colors
```

### `@tryloop/oats init`
Interactively create a configuration file.

```bash
@tryloop/oats init [options]

Options:
  -f, --force       Overwrite existing configuration
  -y, --yes         Use defaults without prompting
```

### `@tryloop/oats validate`
Check if your configuration is valid.

```bash
@tryloop/oats validate [options]

Options:
  -c, --config      Path to config file
```

### `@tryloop/oats detect`
Auto-detect your project structure and create config.

```bash
@tryloop/oats detect
```

**Note:** This will scan your project and try to find:
- Backend with OpenAPI/Swagger specs
- TypeScript client projects
- Frontend applications

## 📚 Real-World Examples

### Example 1: FastAPI (Python) + React + @hey-api/openapi-ts

**Project Structure:**
```
my-project/
├── backend/          # FastAPI backend
├── api-client/       # Generated TypeScript client
└── frontend/         # React app
```

**oats.config.json:**
```json
{
  "services": {
    "backend": {
      "path": "../backend",
      "port": 8000,
      "runtime": "python",
      "python": {
        "virtualEnv": "venv"
      },
      "startCommand": "source venv/bin/activate && uvicorn main:app --reload --port 8000",
      "apiSpec": {
        "path": "runtime:/openapi.json"  // FastAPI generates at runtime
      }
    },
    "client": {
      "path": "../api-client",
      "packageName": "@myapp/api-client",
      "generator": "@hey-api/openapi-ts",
      "generateCommand": "npm run generate",
      "buildCommand": "npm run build"
    },
    "frontend": {
      "path": "./",
      "port": 3000,
      "startCommand": "npm start"
    }
  }
}
```

### Example 2: Express + React + Custom Generator

**Project Structure:**
```
my-project/
├── backend/          # Express API
├── api-client/       # Generated TypeScript client
└── frontend/         # React app
```

**oats.config.json:**
```json
{
  "services": {
    "backend": {
      "path": "../backend",
      "port": 4000,
      "startCommand": "npm run dev",
      "apiSpec": {
        "path": "src/swagger.json"
      }
    },
    "client": {
      "path": "../api-client",
      "packageName": "@myapp/api-client",
      "generator": "custom",
      "generateCommand": "npm run generate",
      "buildCommand": "npm run build",
      "linkCommand": "npm link"
    },
    "frontend": {
      "path": ".",
      "port": 3000,
      "startCommand": "npm start",
      "packageLinkCommand": "npm link"
    }
  }
}
```

### Example 2: NestJS + Next.js + Monorepo

**Project Structure:**
```
my-monorepo/
├── apps/
│   ├── api/          # NestJS backend
│   └── web/          # Next.js frontend
└── packages/
    └── api-client/   # Generated client
```

**oats.config.json:**
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
      "generateCommand": "yarn openapi-ts",
      "buildCommand": "yarn build"
    },
    "frontend": {
      "path": "./apps/web",
      "port": 4200,
      "startCommand": "nx serve web"
    }
  }
}
```

### Example 3: Microservices with Multiple APIs

```json
{
  "services": {
    "backend": {
      "path": "../services/main-api",
      "port": 4000,
      "startCommand": "docker-compose up api",
      "apiSpec": {
        "path": "docs/openapi.yaml"
      }
    },
    "client": {
      "path": "../packages/main-api-client",
      "packageName": "@company/main-api",
      "generator": "custom",
      "generateCommand": "yarn codegen",
      "buildCommand": "yarn tsc"
    },
    "frontend": {
      "path": "../apps/dashboard",
      "port": 8080,
      "startCommand": "yarn serve"
    }
  },
  "sync": {
    "debounceMs": 2000,  // Longer debounce for larger APIs
    "retryAttempts": 5
  }
}
```

## 🤔 Common Issues & Solutions

### Issue: "Port already in use"
**Solution:** OATS now automatically kills processes using required ports! If you still have issues:
```json
{
  "services": {
    "backend": { "port": 4001 },    // Change to available port
    "frontend": { "port": 5174 }    // Change to available port
  }
}
```

### Issue: "Client not updating in frontend"
**Solution:** OATS now includes Vite HMR integration! Check that:
1. Your OpenAPI spec path is correct
2. The generator command works when run manually
3. The package is properly linked (`yarn link` or `npm link`)
4. For Vite users: Add to your `vite.config.ts`:
```typescript
export default defineConfig({
  optimizeDeps: {
    exclude: ['@yourorg/api-client'] // Exclude linked packages
  }
})
```

### Issue: "Command not found: @tryloop/oats"
**Solution:** Use npx or add to package.json scripts:
```bash
# Direct usage
npx @tryloop/oats start

# Or add to package.json
"scripts": {
  "dev:sync": "@tryloop/oats start"
}
```

## 🤝 How OATS Works

```
1. Start: OATS starts your backend, frontend, and watches for changes
   ↓
2. Port Detection: Uses port-based detection to know when services are ready
   ↓
3. Watch: File watcher monitors your OpenAPI spec file
   ↓
4. Detect: When spec changes, OATS compares with previous version
   ↓
5. Copy: Copies swagger.json to client directory for local generation
   ↓
6. Generate: Run your generator command with local spec
   ↓
7. Build: Build the TypeScript client package
   ↓
8. Link: Ensure client is linked to frontend (yarn/npm link)
   ↓
9. HMR Trigger: Touch .oats-sync file to trigger Vite hot-reload
   ↓
10. Reload: Frontend hot-reloads with new types
```

**Robust Architecture:**
- ⚡ Port-based service detection (no flaky log parsing)
- 🔒 Concurrent sync prevention with operation locking
- 🔄 Automatic retry with exponential backoff (2s, 4s, 8s)
- 🧹 Automatic port conflict resolution
- 📁 Local swagger.json copy for reliable generation
- 🔥 Vite HMR integration for instant updates

**Smart Detection:** OATS uses intelligent comparison to avoid unnecessary regeneration:
- ✅ Detects real API changes (new endpoints, changed types)
- ❌ Ignores formatting changes or timestamp updates
- ✅ Uses file hashing for quick comparison

## 🌟 Why OATS?

### Without OATS 😫
```bash
# Make API change
# Wait...
# Manually copy swagger.json
cp ../backend/swagger.json ../client/

# Generate client
cd ../client && yarn generate

# Build client
yarn build

# Link to frontend
yarn link
cd ../frontend && yarn link "@myorg/api-client"

# Restart frontend
# Repeat for every API change... 🔄
```

### With OATS 🚀
```bash
# Just run once
yarn dev:oats

# Make API changes
# Everything syncs automatically! ✨
```

### Feature Comparison

| Feature | Manual Process | Build Scripts | OATS |
|---------|---------------|---------------|------|
| Automatic sync | ❌ | ❌ | ✅ |
| Smart detection | ❌ | ❌ | ✅ |
| Zero config | ❌ | ❌ | ✅ |
| Hot reload | ❌ | Partial | ✅ |
| Error recovery | ❌ | ❌ | ✅ |
| Multi-service | ❌ | Complex | ✅ |

## 🛡️ Reliability & Performance

OATS is built with production reliability in mind:

### Robust Service Management
- **Port-based detection**: Services are detected by port binding, not log parsing
- **Automatic port cleanup**: Kills existing processes on required ports before starting
- **Health monitoring**: Continuous port checking to ensure services stay alive
- **Graceful shutdown**: Proper cleanup of all processes and resources

### Intelligent Sync Engine
- **Concurrent operation prevention**: Lock mechanism prevents duplicate syncs
- **Automatic retry**: Failed operations retry with exponential backoff
- **Debounced file watching**: Prevents rapid regeneration from multiple saves
- **Smart change detection**: Only syncs when meaningful API changes occur

### Error Recovery
- **Service crash recovery**: Emits events when services crash after startup
- **Malformed spec handling**: Graceful error messages for invalid swagger.json
- **Network resilience**: Handles temporary network issues during generation
- **Resource cleanup**: Proper cleanup of intervals, watchers, and child processes

### Performance Optimizations
- **Minimal file I/O**: Efficient file watching with chokidar
- **Smart caching**: Change detection uses efficient hashing
- **Parallel operations**: Services start concurrently when possible
- **Memory efficient**: Proper event listener management

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

```bash
# Clone the repository
git clone https://github.com/loopkitchen/oats.git

# Install dependencies
npm install

# Run tests
npm test

# Start development
npm run dev
```

## 📄 License

MIT © [Hari Shekhar](https://github.com/shekhardtu)

## 🙏 Acknowledgments

OATS is inspired by the challenges faced by developers working with OpenAPI specifications and TypeScript in modern microservices architectures. Special thanks to:

- The OpenAPI community
- TypeScript ecosystem contributors
- Developers who value their time and sanity

---

<p align="center">
  Made with ❤️ and 🌾 for developers who deserve better tooling
</p>

<p align="center">
  <a href="https://github.com/loopkitchen/oats">GitHub</a> •
  <a href="https://www.npmjs.com/package/@tryloop/oats">npm</a> •
  <a href="https://github.com/loopkitchen/oats/issues">Issues</a> •
  <a href="https://github.com/loopkitchen/oats/discussions">Discussions</a>
</p>
# Fast Sync Guide - File-Based OpenAPI Specs

## Problem
Runtime OpenAPI endpoints (like `/openapi.json`) require polling, which adds 5-30 second delays for API changes to reflect in your frontend.

## Solution: File-Based OpenAPI Specs

### Option 1: FastAPI - Auto-Generate on Startup

Add this to your FastAPI `main.py`:

```python
from fastapi import FastAPI
import json
from pathlib import Path

app = FastAPI()

# Your routes here...

@app.on_event("startup")
async def export_openapi():
    """Export OpenAPI spec to file on startup"""
    # Get the OpenAPI schema
    openapi_schema = app.openapi()
    
    # Write to file in the backend directory
    output_path = Path(__file__).parent / "openapi.json"
    with open(output_path, "w") as f:
        json.dump(openapi_schema, f, indent=2)
    
    print(f"OpenAPI spec exported to {output_path}")

# For development: Update on each request (optional)
if __name__ == "__main__":
    import uvicorn
    
    @app.middleware("http")
    async def update_openapi_on_change(request, call_next):
        response = await call_next(request)
        # Only update for successful API requests, not static files
        if request.url.path.startswith("/api"):
            openapi_schema = app.openapi()
            with open("openapi.json", "w") as f:
                json.dump(openapi_schema, f, indent=2)
        return response
    
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### Option 2: Express/Node.js - Swagger-jsdoc

```javascript
const swaggerJsdoc = require('swagger-jsdoc');
const fs = require('fs');
const path = require('path');

// Your swagger config
const specs = swaggerJsdoc(options);

// Write to file on server start
fs.writeFileSync(
  path.join(__dirname, 'openapi.json'),
  JSON.stringify(specs, null, 2)
);

// Watch for changes in development
if (process.env.NODE_ENV === 'development') {
  const chokidar = require('chokidar');
  
  chokidar.watch('./routes/**/*.js').on('change', () => {
    const newSpecs = swaggerJsdoc(options);
    fs.writeFileSync('openapi.json', JSON.stringify(newSpecs, null, 2));
  });
}
```

### Option 3: Django REST Framework

```python
# In your urls.py or management command
from django.core.management.base import BaseCommand
from rest_framework.schemas import get_schema_view
import json

class Command(BaseCommand):
    def handle(self, *args, **options):
        schema_view = get_schema_view(
            title="Your API",
            version="1.0.0"
        )
        
        schema = schema_view.get_schema()
        
        with open('openapi.json', 'w') as f:
            json.dump(schema, f, indent=2)
```

### Option 4: Generic Script Solution

Create a script that fetches and saves the OpenAPI spec:

**scripts/export-openapi.js**:
```javascript
const fs = require('fs');
const fetch = require('node-fetch');

async function exportOpenAPI() {
  try {
    // Wait for backend to be ready
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Fetch from runtime endpoint
    const response = await fetch('http://localhost:8000/openapi.json');
    const spec = await response.json();
    
    // Write to file
    fs.writeFileSync('./openapi.json', JSON.stringify(spec, null, 2));
    console.log('OpenAPI spec exported to ./openapi.json');
  } catch (error) {
    console.error('Failed to export OpenAPI:', error);
    // Retry after 1 second
    setTimeout(exportOpenAPI, 1000);
  }
}

// Run on startup
exportOpenAPI();

// Watch for file changes and re-export
if (process.env.NODE_ENV === 'development') {
  const chokidar = require('chokidar');
  
  chokidar.watch(['./routes', './models', './api']).on('change', () => {
    console.log('API files changed, re-exporting OpenAPI...');
    exportOpenAPI();
  });
}
```

Then modify your start command:
```json
{
  "startCommand": "node scripts/export-openapi.js & uvicorn main:app --reload"
}
```

## OATS Configuration

Once you have file generation working, update your OATS config:

```typescript
export default defineConfig({
  services: {
    backend: {
      path: '../backend/cloud_endpoints',
      port: 8000,
      startCommand: '.venv/bin/uvicorn services.frontend_data_service.main:app --reload --port 8000',
      apiSpec: {
        path: 'openapi.json'  // File path, not /openapi.json endpoint
      }
    }
  },
  sync: {
    strategy: 'smart',
    debounceMs: 500,      // Can be faster with file watching
    // No pollingInterval needed - file watching is instant!
  }
})
```

## Benefits

1. **Instant Detection**: File changes are detected immediately
2. **No Polling Delay**: No 5-30 second wait
3. **Less Network Traffic**: No constant HTTP requests
4. **More Reliable**: No timeout errors during backend restart

## Universal Approach

For a solution that works with ANY backend:

1. **Add a post-start hook** that exports the OpenAPI spec:
```json
{
  "startCommand": "your-backend-start && curl http://localhost:8000/openapi.json > openapi.json"
}
```

2. **Use a wrapper script** that handles spec export:
```bash
#!/bin/bash
# start-with-openapi.sh

# Start backend in background
$1 &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 3

# Export OpenAPI spec
while true; do
  curl -s http://localhost:${PORT:-8000}/openapi.json > openapi.json.tmp
  if [ $? -eq 0 ]; then
    mv openapi.json.tmp openapi.json
  fi
  sleep 2
done &

# Wait for backend process
wait $BACKEND_PID
```

Then use:
```json
{
  "startCommand": "./start-with-openapi.sh 'uvicorn main:app --reload'"
}
```

This approach works for any backend that exposes an OpenAPI endpoint!
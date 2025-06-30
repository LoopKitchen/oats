# FastAPI + React + @hey-api/openapi-ts Example

This example demonstrates using OATSJS with a Python FastAPI backend, React frontend, and @hey-api/openapi-ts for client generation.

## Project Structure

```
fastapi-react-hey-api/
├── backend/              # FastAPI backend
│   ├── main.py          # FastAPI application
│   ├── requirements.txt  # Python dependencies
│   └── venv/            # Python virtual environment (generated)
├── client/              # TypeScript API client
│   ├── src/             # Generated TypeScript code
│   ├── openapi-ts.config.ts  # @hey-api/openapi-ts configuration
│   ├── package.json     # Client dependencies
│   └── tsconfig.json    # TypeScript configuration
└── frontend/            # React frontend
    ├── src/             # React components
    ├── public/          # Static assets
    ├── package.json     # Frontend dependencies
    └── oats.config.json # OATSJS configuration (MUST be here)
```

## Prerequisites

- Python 3.8+
- Node.js 18+
- npm or yarn
- OATS CLI: `npm install -g @tryloop/oats`

## Quick Start

Use the provided setup script:

```bash
./setup.sh
```

Or follow the manual setup below.

## Manual Setup

### 1. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Client Setup

```bash
cd ../client
npm install
```

### 3. Frontend Setup

```bash
cd ../frontend
npm install
```

## Running with OATSJS

From the frontend directory:

```bash
cd frontend
oats start
```

This will:
1. Start the FastAPI backend on port 8000
2. Watch for Python file changes in the backend
3. Automatically fetch the OpenAPI spec from FastAPI's runtime endpoint
4. Regenerate the TypeScript client when APIs change
5. Build and link the client package to the frontend
6. Start the React dev server on port 3000
7. Trigger hot-reload in the React app when the client updates

## Manual Development

You can also run services individually:

### Backend
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

### Client Generation
```bash
cd client
# Copy latest OpenAPI spec
curl http://localhost:8000/openapi.json > swagger.json
# Generate TypeScript client
npm run generate
# Build the client
npm run build
# Link for local development
npm link
```

### Frontend
```bash
cd frontend
# Link the local client
npm link @example/api-client
# Start React dev server
npm start
```

## Important Notes

1. **TypeScript Version**: The frontend uses TypeScript 4.9.5 for compatibility with react-scripts 5.0.1
2. **Client Dependencies**: The client requires `@hey-api/client-fetch` which is included in package.json
3. **OATS Configuration**: The `oats.config.json` MUST be in the frontend directory
4. **Python Virtual Environment**: Always activate the virtual environment before running the backend

## Troubleshooting

### TypeScript Version Conflicts
If you see TypeScript version errors, ensure the frontend is using TypeScript 4.9.5:
```bash
cd frontend
npm install typescript@^4.9.5
```

### Client Build Errors
If the client fails to build with missing types:
1. Ensure `tsconfig.json` includes `"DOM"` in the lib array
2. Install missing dependencies: `npm install @hey-api/client-fetch`

### OpenAPI Spec Not Found
If client generation fails:
1. Ensure the FastAPI backend is running
2. Check that http://localhost:8000/openapi.json is accessible
3. Verify the backend is on port 8000

## API Documentation

When the FastAPI backend is running, you can access:
- Interactive API docs: http://localhost:8000/docs
- OpenAPI schema: http://localhost:8000/openapi.json

## Configuration Details

The `oats.config.json` uses runtime OpenAPI spec fetching:
```json
{
  "services": {
    "backend": {
      "apiSpec": {
        "path": "runtime:/openapi.json"
      }
    }
  }
}
```

This means OATSJS will fetch the OpenAPI spec from the running backend, ensuring it's always up-to-date.
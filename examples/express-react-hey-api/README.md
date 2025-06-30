# Express + React + @hey-api/openapi-ts Example

This example demonstrates using OATSJS with a Node.js Express backend, React frontend, and @hey-api/openapi-ts for client generation with Axios.

## Project Structure

```
express-react-hey-api/
├── backend/              # Express.js backend with swagger-jsdoc
│   ├── src/
│   │   └── index.js     # Express API with Swagger JSDoc
│   ├── swagger.json     # Generated OpenAPI spec
│   └── package.json     # Backend dependencies
├── client/              # TypeScript API client (axios-based)
│   ├── src/             # Generated TypeScript code
│   ├── openapi-ts.config.ts  # @hey-api configuration for axios
│   ├── package.json     # Client dependencies
│   └── tsconfig.json    # TypeScript configuration
└── frontend/            # React frontend
    ├── src/             # React components
    ├── public/          # Static assets
    ├── package.json     # Frontend dependencies
    └── oats.config.json # OATSJS configuration (MUST be here)
```

## Key Features

- **Express Backend**: RESTful API with swagger-jsdoc for OpenAPI generation
- **Axios Client**: Uses @hey-api/openapi-ts with axios for HTTP requests
- **Type Safety**: Full TypeScript support with generated types
- **Auto-sync**: OATSJS watches for API changes and regenerates the client
- **Build-time OpenAPI**: Swagger spec generated from JSDoc comments

## Prerequisites

- Node.js 18+
- npm or yarn
- OATS CLI: `npm install -g @tryloop/oats`

## Setup

### Quick Setup

Run the setup script from the example root:

```bash
./test-setup.sh
```

### Manual Setup

#### 1. Backend Setup

```bash
cd backend
npm install
npm run generate-swagger  # Generate initial swagger.json
```

#### 2. Client Setup

```bash
cd ../client
npm install
```

#### 3. Frontend Setup

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
1. Start the Express backend on port 4000
2. Watch for changes in the backend code and swagger comments
3. Automatically regenerate swagger.json when the API changes
4. Regenerate the TypeScript client with @hey-api/openapi-ts
5. Build and link the client package
6. Start the React dev server on port 3000
7. Trigger hot-reload in the React app when the client updates

## Manual Development

You can also run services individually:

### Backend
```bash
cd backend
npm run dev  # Starts with nodemon for auto-reload
```

### Client Generation
```bash
cd client
# Copy latest OpenAPI spec
cp ../backend/swagger.json .
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
npm link @example/todo-api-client
# Start React dev server
npm start
```

## Accessing the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:4000
- **Swagger UI**: http://localhost:4000/docs
- **OpenAPI Spec**: http://localhost:4000/swagger.json

## How It Works

### 1. Backend API Definition

The Express backend uses swagger-jsdoc to generate OpenAPI specs from JSDoc comments:

```javascript
/**
 * @swagger
 * /todos:
 *   post:
 *     summary: Create a new todo
 *     tags: [Todos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TodoCreate'
 *     responses:
 *       201:
 *         description: Created todo
 */
app.post('/todos', (req, res) => {
  // Implementation
});
```

### 2. Client Generation

The client is configured to use axios:

```typescript
// openapi-ts.config.ts
export default defineConfig({
  client: 'axios',  // Using axios instead of fetch
  input: './swagger.json',
  output: './src',
  services: {
    asClass: true,
  },
});
```

### 3. Frontend Usage

The React app uses the generated client with full type safety:

```typescript
import { OpenAPI, TodosService, type Todo } from '@example/todo-api-client';

// Configure base URL
OpenAPI.BASE = 'http://localhost:4000';

// Use the service
const todos = await TodosService.getTodos();
const newTodo = await TodosService.createTodo({
  requestBody: { title: 'New todo', completed: false }
});
```

## Testing the Sync

1. **Modify the API**: Edit `backend/src/index.js`
   - Add a new field to the Todo schema
   - Add a new endpoint
   - Modify existing endpoints

2. **Watch OATSJS**: The console will show:
   - File change detection
   - Swagger spec regeneration
   - Client regeneration
   - Package building and linking

3. **See Type Safety**: The React app will have immediate access to:
   - New types and interfaces
   - New service methods
   - Updated API schemas

## Differences from FastAPI Example

| Feature | This Example | FastAPI Example |
|---------|--------------|-----------------|
| Backend | Express.js | FastAPI |
| OpenAPI Generation | swagger-jsdoc (build-time) | FastAPI (runtime) |
| HTTP Client | Axios | Fetch API |
| Language | JavaScript/TypeScript | Python |
| OpenAPI Update | Requires server restart | Automatic on reload |

## Important Notes

1. **OATS Configuration Location**: The `oats.config.json` MUST be in the frontend directory
2. **Swagger Generation**: Unlike FastAPI's runtime generation, Express requires explicit swagger.json generation
3. **Client HTTP Library**: This example uses axios instead of fetch for better interceptor support
4. **TypeScript Versions**: Ensure compatible versions across all packages

## Troubleshooting

### "Cannot find module '@example/todo-api-client'"
Make sure the client is built and linked:
```bash
cd client
npm run build
npm link
cd ../frontend
npm link @example/todo-api-client
```

### Backend not starting
Check if port 4000 is available or modify it in:
- `backend/src/index.js`
- `frontend/oats.config.json`
- `frontend/src/App.tsx`

### Swagger spec not updating
1. Ensure your JSDoc comments follow the swagger-jsdoc format
2. The backend needs to restart to regenerate swagger.json
3. Check the console for swagger-jsdoc errors

### Axios vs Fetch Issues
If you prefer fetch over axios:
1. Update `client/openapi-ts.config.ts` to use `client: 'fetch'`
2. Install `@hey-api/client-fetch` instead of `@hey-api/client-axios`
3. Update the frontend code to handle fetch API patterns

## Configuration Details

The `oats.config.json` uses file-based OpenAPI spec:
```json
{
  "services": {
    "backend": {
      "apiSpec": {
        "path": "swagger.json",
        "generateCommand": "npm run generate-swagger"
      }
    }
  }
}
```

This tells OATSJS to:
1. Watch for swagger.json changes
2. Run the generate command when backend files change
3. Use the generated swagger.json for client generation

## Next Steps

- Try adding authentication to the API
- Implement real-time features with Socket.io
- Add data validation with express-validator
- Deploy with Docker and test production sync
- Experiment with different OpenAPI generators
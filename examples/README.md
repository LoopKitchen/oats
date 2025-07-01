# OATS Configuration Examples

This directory contains example configurations for OATS.

## TypeScript Configuration (Recommended)

Using TypeScript configuration provides the best developer experience with:
- Full IntelliSense and autocomplete
- Type checking
- Clear indication of required vs optional fields
- Inline documentation

See `oats.config.ts` for a complete example.

### Usage

1. Create `oats.config.ts` in your project root
2. Import the `defineConfig` function:
   ```typescript
   import { defineConfig } from '@tryloop/oats';
   ```
3. Export your configuration:
   ```typescript
   export default defineConfig({
     // Your config here
   });
   ```

## JSON Configuration

Traditional JSON configuration is also supported with JSON Schema for IntelliSense.

See `oats.config.json` for an example.

### Usage

1. Create `oats.config.json` in your project root
2. Add the schema reference for IntelliSense:
   ```json
   {
     "$schema": "node_modules/@tryloop/oats/schema/oats.schema.json",
     // Your config here
   }
   ```

## Running OATS

Both configuration formats work the same way:

```bash
# OATS will automatically detect oats.config.ts or oats.config.json
oats start

# Or specify a config file explicitly
oats start -c my-config.ts
oats start -c my-config.json
```
# Logging Behavior Test Guide

## Log Levels

The new logging system works as follows:

### 1. **error** - Only errors
- Shows only error messages
- No service output
- No status messages
- Minimal output

### 2. **warn** - Warnings and errors  
- Shows warnings and errors
- No info messages or service output
- Good for CI/CD environments

### 3. **info** - Important events (default)
- Shows service start/stop messages
- Shows sync completion status
- Shows service output if `showServiceOutput: true`
- Default and recommended for development

### 4. **debug** - Everything
- Shows all messages including timing
- Shows detailed sync steps
- Writes to log file if configured
- Best for troubleshooting

## Configuration Examples

### Quiet Mode (Minimal Output)
```json
{
  "log": {
    "level": "error",
    "showServiceOutput": false
  }
}
```

### Development Mode (Default)
```json
{
  "log": {
    "level": "info",
    "showServiceOutput": true
  }
}
```

### Debug Mode (Maximum Output)
```json
{
  "log": {
    "level": "debug",
    "showServiceOutput": true,
    "file": "./oats.log"
  }
}
```

## Testing

To test the logging in loop-frontend:

1. Update your `oats.config.ts`:
```typescript
log: {
  level: 'error',  // Change this to test different levels
  showServiceOutput: false
}
```

2. Run `yarn dev` and observe the output

## Migration from `quiet` flag

The `quiet: true` flag is now deprecated. Replace it with:
- `level: 'error'` for minimal output
- `level: 'warn'` for warnings only
- Remove `quiet` entirely and use log levels
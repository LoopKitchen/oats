# OATS Optimization Guide

## Reducing Logs and Preventing Repetitive Syncs

### Issue
- Too many log messages
- Repetitive synchronization every 5 seconds
- Duplicate initial synchronization

### Solutions

## 1. Adjust Log Level (Immediate Fix)
Set log level to 'warn' or 'error' to see only important messages:

```typescript
log: {
  level: 'warn',  // or 'error' for minimal output
  showServiceOutput: false
}
```

## 2. Disable Initial Generation
If your API hasn't changed, disable the initial sync:

```typescript
sync: {
  runInitialGeneration: false
}
```

## 3. Increase Polling Interval
For stable APIs, increase the polling interval:

```typescript
sync: {
  pollingInterval: 30000  // 30 seconds instead of 5
}
```

## 4. Use Smart Sync Strategy
Ensure you're using the 'smart' strategy to skip unchanged APIs:

```typescript
sync: {
  strategy: 'smart'  // Only sync on meaningful changes
}
```

## 5. Complete Optimized Config
Here's a config optimized for minimal noise:

```typescript
export default defineConfig({
  // ... your services config ...
  sync: {
    strategy: 'smart',
    debounceMs: 2000,        // Wait 2s before syncing
    pollingInterval: 30000,   // Check every 30s
    runInitialGeneration: false,  // No sync on startup
    showStepDurations: false  // Hide timing info
  },
  log: {
    level: 'warn',           // Only warnings and errors
    showServiceOutput: false // Hide backend/frontend logs
  }
})
```

## Why This Happens

1. **Runtime API Specs**: When using paths like `/openapi.json`, OATS polls the endpoint regularly because it can't watch a file
2. **Initial Generation**: By default, OATS runs a sync on startup to ensure everything is up-to-date
3. **Smart Detection**: Even with 'smart' strategy, the first comparison after startup might trigger a sync

## Best Practices

1. **Development**: Use 'info' level with shorter polling intervals
2. **Stable Development**: Use 'warn' level with longer polling intervals
3. **CI/CD**: Use 'error' level with no polling (file-based specs only)

## Alternative: Static API Spec
If your API spec doesn't change frequently, consider using a static file:

```typescript
backend: {
  apiSpec: {
    path: 'docs/openapi.json'  // File path instead of runtime endpoint
  }
}
```

This will use file watching instead of polling, reducing unnecessary checks.
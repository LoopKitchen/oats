# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.0] - 2025-06-30

### Added
- **Polling-based sync for runtime API specs**: New intelligent polling mechanism for FastAPI and other runtime-generated OpenAPI specs
- **Smart hash comparison**: Uses SHA-256 hash comparison to avoid unnecessary regeneration
- **Configurable polling interval**: New `sync.pollingInterval` option (default 5 seconds) for runtime specs
- **Performance tracking**: New `sync.showStepDurations` option to display timing for each sync step
- **Incremental TypeScript compilation**: Added incremental build support for faster client compilation
- **Spec-based caching**: Stores spec hash to skip regeneration when spec hasn't changed
- **Flexible spec naming**: Support for custom OpenAPI spec filenames (not just swagger.json)
- **getCurrentHash() method**: Added to SwaggerChangeDetector for hash retrieval

### Changed
- **45% faster sync time**: Reduced from ~3.4s to ~1.8s for changed specs through optimizations
- **No file watching for runtime specs**: Eliminated watching Python files and "too many open files" errors
- **Smarter initial sync**: Fixed duplicate syncs on startup
- **Better retry logic**: Improved retry mechanism for fetching runtime specs with configurable delays

### Fixed
- Fixed excessive file watching that caused "EMFILE: too many open files" errors
- Fixed always syncing issue for runtime specs by properly using hash comparison
- Fixed runtime spec detection to support both `runtime:` prefix and `/` paths
- Fixed spec filename handling to support any OpenAPI spec filename

### Performance
- Client build time reduced by 64% when using incremental compilation
- Near-instant sync when no API changes detected (hash comparison)
- Eliminated unnecessary file system operations for runtime specs

## [2.1.16] - 2025-06-30

### Added
- **Automatic port conflict resolution**: OATS now automatically detects and kills processes using conflicting ports before starting services
- **Enhanced port detection**: Prioritizes OS-level tools (lsof/netstat) over third-party libraries for more reliable port checking
- **Binary permission fix**: Added automatic executable permissions to the CLI binary during build
- **Configurable port handling**: New `sync.autoKillConflictingPorts` option to control automatic port killing behavior
- **Cleaner logging**: Verbose port checking logs now only show in debug mode

### Fixed
- Fixed "Permission denied" error when running oats command after npm/yarn global installation
- Fixed port detection reliability issues on macOS/Linux by using lsof command directly
- Fixed binary execution issues by adding proper bin wrapper script
- Fixed Windows compatibility for port detection and process killing

### Changed
- **Simplified configuration**: Default oats.config.json now uses minimal settings with smart defaults
- Build process now automatically sets executable permissions on the CLI binary
- Port conflict handling now kills existing processes by default (can be disabled)
- Improved error messages during service startup failures
- Updated templates to use runtime API endpoints instead of file paths (recommended approach)

## [2.1.11] - 2025-06-29

### Added
- Express + React + @hey-api example with axios client
- FastAPI + React + @hey-api example with fetch client
- Comprehensive example documentation with troubleshooting guides
- Examples .gitignore for build artifacts

### Changed
- Made frontend `port` and `startCommand` fields mandatory when frontend config is provided
- Moved `oats.config.json` to frontend directory in examples (best practice)
- Enhanced configuration validation with helpful error messages for missing frontend fields

### Fixed
- Fixed oats.config.json location in FastAPI example
- Fixed TypeScript version compatibility in examples
- Fixed missing dependencies in client generation

## [Unreleased]

### Added
- Complete TypeScript migration with strict type checking
- Comprehensive type definitions for all configuration options
- JSON Schema for IDE support and validation
- Custom error hierarchy for better error handling
- Jest test infrastructure with coverage reporting
- ESLint and Prettier configuration for code quality
- EditorConfig for consistent coding standards
- Proper project structure with separation of concerns
- Automatic package unlinking on shutdown to clean up linked packages
- Package manager detection for proper unlink commands (npm, yarn, pnpm)

### Changed
- Refactored entire codebase to TypeScript
- Improved configuration validation with detailed error messages
- Enhanced error handling with recoverable vs non-recoverable errors
- Updated build process to compile TypeScript
- Package linking is now tracked and automatically cleaned up on shutdown

### Fixed
- Configuration validation now properly handles all edge cases
- Frontend configuration is now properly optional
- Sync configuration uses sensible defaults
- Linked packages are now properly unlinked when stopping oats

## [1.0.5] - 2024-06-28

### Changed
- Made frontend configuration optional
- Added default values for sync configuration

### Fixed
- Fixed validation schema to allow optional fields

## [1.0.4] - 2024-06-28

### Changed
- Significantly improved README documentation
- Added real-world examples
- Added common issues and solutions section
- Made documentation more user-friendly

## [1.0.3] - 2024-06-28

### Fixed
- Fixed path resolution to use process.cwd()
- Fixed configuration format mapping

## [1.0.2] - 2024-06-28

### Fixed
- Fixed validation schema for generateCommand
- Fixed lodash import issues

## [1.0.1] - 2024-06-28

### Added
- Initial configuration detection
- Support for custom generators

## [1.0.0] - 2024-06-28

### Added
- Initial release
- Automatic OpenAPI/Swagger synchronization
- Multi-service orchestration
- Smart change detection
- TypeScript client generation
- Hot-reload support

[Unreleased]: https://github.com/loopkitchen/oats/compare/v1.0.5...HEAD
[1.0.5]: https://github.com/loopkitchen/oats/compare/v1.0.4...v1.0.5
[1.0.4]: https://github.com/loopkitchen/oats/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/loopkitchen/oats/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/loopkitchen/oats/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/loopkitchen/oats/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/loopkitchen/oats/releases/tag/v1.0.0
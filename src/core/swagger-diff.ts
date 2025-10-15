/**
 * OATS Swagger/OpenAPI Change Detection
 *
 * Intelligent detection of meaningful changes in API specifications
 *
 * @module @oatsjs/core/swagger-diff
 */

import crypto from 'crypto';

export interface ApiChange {
  type: 'added' | 'removed' | 'modified';
  path: string;
  description: string;
  severity: 'major' | 'minor' | 'patch';
}

export interface ChangeDetectionResult {
  hasChanges: boolean;
  changes: ApiChange[];
  summary: {
    major: number;
    minor: number;
    patch: number;
  };
}

/**
 * Detects meaningful changes in OpenAPI/Swagger specifications
 */
export class SwaggerChangeDetector {
  private lastState: string | null = null;
  private lastSpec: any = null;
  private currentState: string | null = null;

  /**
   * Check if API specification has significant changes
   */
  hasSignificantChanges(currentSpec: any): boolean {
    const currentState = this.calculateSpecHash(currentSpec);
    this.currentState = currentState;

    if (this.lastState === null) {
      // First time, consider it a change
      this.lastState = currentState;
      this.lastSpec = currentSpec;
      return true;
    }

    if (this.lastState === currentState) {
      // No changes at all
      return false;
    }

    // Analyze the actual changes
    const changes = this.detectChanges(this.lastSpec, currentSpec);

    // Update state
    this.lastState = currentState;
    this.lastSpec = currentSpec;

    // Consider changes significant if they affect the API contract
    return this.areChangesSignificant(changes);
  }

  /**
   * Get the current spec hash
   */
  getCurrentHash(): string | null {
    return this.currentState;
  }

  /**
   * Manually prime detector state with a known spec snapshot
   */
  primeWithSpec(spec: any): void {
    const hash = this.calculateSpecHash(spec);
    this.lastState = hash;
    this.lastSpec = spec;
    this.currentState = hash;
  }

  /**
   * Expose hash calculation for caching strategies
   */
  getSpecHash(spec: any): string {
    return this.calculateSpecHash(spec);
  }

  /**
   * Get detailed change analysis
   */
  analyzeChanges(previousSpec: any, currentSpec: any): ChangeDetectionResult {
    const changes = this.detectChanges(previousSpec, currentSpec);

    const summary = {
      major: changes.filter((c) => c.severity === 'major').length,
      minor: changes.filter((c) => c.severity === 'minor').length,
      patch: changes.filter((c) => c.severity === 'patch').length,
    };

    return {
      hasChanges: changes.length > 0,
      changes,
      summary,
    };
  }

  /**
   * Calculate hash of API specification
   */
  private calculateSpecHash(spec: any): string {
    // Extract only the meaningful parts for hashing
    const relevantSpec = this.extractRelevantParts(spec);
    // Serialize with sorted keys for consistent hashing
    const serialized = JSON.stringify(relevantSpec, null, 2);
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Extract parts of spec that matter for API contract
   */
  private extractRelevantParts(spec: any): any {
    if (!spec) {
      return {};
    }

    const relevant: any = {};

    // Core spec info
    if (spec.info) {
      relevant.info = {
        version: spec.info.version,
        title: spec.info.title,
      };
    }

    // Paths (endpoints)
    if (spec.paths) {
      relevant.paths = this.normalizePaths(spec.paths);
    }

    // Components/definitions (schemas)
    if (spec.components?.schemas) {
      relevant.schemas = spec.components.schemas;
    } else if (spec.definitions) {
      relevant.schemas = spec.definitions;
    }

    // Security definitions
    if (spec.components?.securitySchemes) {
      relevant.security = spec.components.securitySchemes;
    } else if (spec.securityDefinitions) {
      relevant.security = spec.securityDefinitions;
    }

    return relevant;
  }

  /**
   * Normalize paths for comparison
   */
  private normalizePaths(paths: any): any {
    const normalized: any = {};

    for (const [path, pathItem] of Object.entries(paths)) {
      normalized[path] = {};

      for (const [method, operation] of Object.entries(pathItem as any)) {
        if (typeof operation === 'object' && operation !== null) {
          const op = operation as any;
          normalized[path][method] = {
            operationId: op.operationId,
            summary: op.summary,
            parameters: op.parameters || [],
            requestBody: op.requestBody,
            responses: op.responses || {},
            tags: op.tags || [],
          };
        }
      }
    }

    return normalized;
  }

  /**
   * Detect specific changes between specs
   */
  private detectChanges(oldSpec: any, newSpec: any): ApiChange[] {
    const changes: ApiChange[] = [];

    if (!oldSpec || !newSpec) {
      return changes;
    }

    // Extract and normalize relevant parts for comparison
    const oldRelevant = this.extractRelevantParts(oldSpec);
    const newRelevant = this.extractRelevantParts(newSpec);

    // Compare normalized paths
    changes.push(
      ...this.compareObjects(
        oldRelevant.paths || {},
        newRelevant.paths || {},
        'paths',
        this.classifyPathChange.bind(this)
      )
    );

    // Compare schemas
    changes.push(
      ...this.compareObjects(
        oldRelevant.schemas || {},
        newRelevant.schemas || {},
        'schemas',
        this.classifySchemaChange.bind(this)
      )
    );

    return changes;
  }

  /**
   * Compare two objects and detect changes
   */
  private compareObjects(
    oldObj: any,
    newObj: any,
    basePath: string,
    classifier: (
      changeType: string,
      path: string
    ) => { description: string; severity: ApiChange['severity'] }
  ): ApiChange[] {
    const changes: ApiChange[] = [];
    const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

    for (const key of allKeys) {
      const path = `${basePath}.${key}`;
      const oldValue = oldObj[key];
      const newValue = newObj[key];

      if (oldValue === undefined && newValue !== undefined) {
        // Added
        const { description, severity } = classifier('added', path);
        changes.push({
          type: 'added',
          path,
          description,
          severity,
        });
      } else if (oldValue !== undefined && newValue === undefined) {
        // Removed
        const { description, severity } = classifier('removed', path);
        changes.push({
          type: 'removed',
          path,
          description,
          severity,
        });
      } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        // Modified
        const { description, severity } = classifier('modified', path);
        changes.push({
          type: 'modified',
          path,
          description,
          severity,
        });
      }
    }

    return changes;
  }

  /**
   * Classify path changes
   */
  private classifyPathChange(
    changeType: string,
    path: string
  ): { description: string; severity: ApiChange['severity'] } {
    if (changeType === 'added') {
      return {
        description: `New endpoint added: ${path}`,
        severity: 'minor',
      };
    } else if (changeType === 'removed') {
      return {
        description: `Endpoint removed: ${path}`,
        severity: 'major',
      };
    } else {
      return {
        description: `Endpoint modified: ${path}`,
        severity: 'minor',
      };
    }
  }

  /**
   * Classify schema changes
   */
  private classifySchemaChange(
    changeType: string,
    path: string
  ): { description: string; severity: ApiChange['severity'] } {
    if (changeType === 'added') {
      return {
        description: `New schema added: ${path}`,
        severity: 'minor',
      };
    } else if (changeType === 'removed') {
      return {
        description: `Schema removed: ${path}`,
        severity: 'major',
      };
    } else {
      return {
        description: `Schema modified: ${path}`,
        severity: 'minor',
      };
    }
  }

  /**
   * Determine if changes are significant enough to trigger regeneration
   */
  private areChangesSignificant(changes: ApiChange[]): boolean {
    // Any major or minor changes are significant
    return changes.some(
      (change) => change.severity === 'major' || change.severity === 'minor'
    );
  }

  /**
   * Reset the detector state
   */
  reset(): void {
    this.lastState = null;
    this.lastSpec = null;
  }

  /**
   * Get current state hash
   */
  getCurrentState(): string | null {
    return this.lastState;
  }
}

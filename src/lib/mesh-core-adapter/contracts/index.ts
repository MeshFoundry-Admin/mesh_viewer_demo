/**
 * JSON Schema Contracts for Mesh Core Adapter Observability
 * 
 * This module exports JSON Schemas defined in spec/003-mesh-core-adapter/contracts/
 * for use in TypeScript.
 * 
 * Note: Zod schemas are defined in schema-validator.ts.
 * 
 * @module contracts
 */

import { z } from 'zod';
import {
  LogEventSchema,
  AdapterErrorSchema,
  AdapterMetricsSchema,
} from '../schema-validator';

// JSON Schema file paths (should be included as assets in build configuration)
export const SCHEMA_PATHS = {
  LogEvent: 'LogEvent.schema.json',
  AdapterError: 'AdapterError.schema.json',
  AdapterMetrics: 'AdapterMetrics.schema.json',
  MeshAsset: 'MeshAsset.schema.json',
  MeshLoadResult: 'MeshLoadResult.schema.json',
} as const;

/**
 * Schema ID constants
 */
export const SCHEMA_IDS = {
  LogEvent: 'https://meshfoundry.dev/schemas/LogEvent.schema.json',
  AdapterError: 'https://meshfoundry.dev/schemas/AdapterError.schema.json',
  AdapterMetrics: 'https://meshfoundry.dev/schemas/AdapterMetrics.schema.json',
  MeshAsset: 'https://meshfoundry.dev/schemas/MeshAsset.schema.json',
  MeshLoadResult: 'https://meshfoundry.dev/schemas/MeshLoadResult.schema.json',
} as const;

/**
 * Factory function that returns Zod Schema instances
 * (using Zod instead of Ajv)
 */
export function getSchemas() {
  return {
    LogEvent: LogEventSchema,
    AdapterError: AdapterErrorSchema,
    AdapterMetrics: AdapterMetricsSchema,
  };
}

/**
 * @deprecated Use getSchemas() instead - migrated to Zod
 */
export function createSchemaValidator(): { validate: (schema: z.ZodType, data: unknown) => boolean } {
  return {
    validate: (schema: z.ZodType, data: unknown) => schema.safeParse(data).success,
  };
}

// Re-export types for convenience
export type {
  LogEvent,
  LogLevel,
  LogContext,
  AdapterError,
  AdapterErrorCode,
  ErrorContext,
  AdapterMetrics,
  MeshAsset,
  MeshLoadResult,
} from '../types';

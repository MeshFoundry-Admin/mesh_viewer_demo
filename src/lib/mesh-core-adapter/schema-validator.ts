/**
 * Schema Validator Module
 *
 * Provides Zod-based runtime validation.
 * Performs runtime validation for LogEvent, AdapterError, and AdapterMetrics types.
 *
 * @module schema-validator
 */

import { z } from 'zod';

import type { LogEvent, AdapterError, AdapterMetrics } from './types';

// ============================================================================
// Zod Schemas
// ============================================================================

/**
 * LogLevel schema
 */
const LogLevelSchema = z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']);

/**
 * LogContext schema
 */
export const LogContextSchema = z.object({
  category: z.enum(['io', 'adapter', 'robustness', 'bench', 'wasm']).optional(),
  op: z.string().optional(),
  elapsed_ms: z.number().min(0).optional(),
  code: z.string().optional(),
  fileId: z.string().optional(),
}).passthrough(); // Allow extension fields

/**
 * LogEvent schema
 * 
 * @see LogEvent.schema.json
 */
export const LogEventSchema = z.object({
  level: LogLevelSchema,
  message: z.string().min(1),
  timestamp: z.string().datetime(), // ISO 8601 format
  context: LogContextSchema.optional(),
});

/**
 * AdapterErrorCode schema
 */
const AdapterErrorCodeSchema = z.enum([
  'E_EMPTY_FILE',
  'E_FILE_TOO_LARGE',
  'E_FILE_READ_FAILED',
  'E_PARSE_FAILED',
  'E_UNSUPPORTED_FORMAT',
  'E_MEMORY_LIMIT',
  'E_FETCH_FAILED',
  'E_FETCH_TIMEOUT',
  'E_INVALID_MESH',
  'E_TOO_MANY_TRIANGLES',
]);

/**
 * ErrorSeverity schema
 */
const ErrorSeveritySchema = z.enum(['error', 'warning']);

/**
 * ErrorContext schema
 */
export const ErrorContextSchema = z.object({
  fileName: z.string().optional(),
  requiredBytes: z.number().min(0).optional(),
  availableBytes: z.number().min(0).optional(),
  triangleCount: z.number().min(0).optional(),
  maxTriangles: z.number().min(0).optional(),
  format: z.string().optional(),
}).passthrough(); // Allow extension fields

/**
 * AdapterError schema
 * 
 * @see AdapterError.schema.json
 */
export const AdapterErrorSchema = z.object({
  code: AdapterErrorCodeSchema,
  message: z.string().min(1),
  severity: ErrorSeveritySchema,
  timestamp: z.string().datetime(), // ISO 8601 format
  context: ErrorContextSchema.optional(),
});

/**
 * ParserMode schema
 */
const ParserModeSchema = z.enum(['fast', 'exact']);

/**
 * AdapterMetrics schema
 * 
 * @see AdapterMetrics.schema.json
 */
export const AdapterMetricsSchema = z.object({
  fileId: z.string().min(1),
  parseTimeMs: z.number().min(0),
  totalTimeMs: z.number().min(0),
  vertexCount: z.number().int().min(0),
  triangleCount: z.number().int().min(0),
  parserMode: ParserModeSchema,
  fallbackCount: z.number().int().min(0).max(1),
  bytesRead: z.number().int().min(0),
});

// ============================================================================
// Validation Result Types
// ============================================================================

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation succeeded */
  valid: boolean;
  /** List of errors when validation fails */
  errors?: ValidationError[];
}

/**
 * Validation error details
 */
export interface ValidationError {
  /** JSON path (e.g., "context.category") */
  path: string;
  /** Error message */
  message: string;
  /** Zod error code */
  code: string;
}

// ============================================================================
// Error Formatting
// ============================================================================

/**
 * Convert Zod errors to ValidationError format
 */
function formatZodErrors(error: z.ZodError): ValidationError[] {
  return error.issues.map((issue: z.ZodIssue) => ({
    path: issue.path.join('.') || '/',
    message: issue.message,
    code: issue.code,
  }));
}

// ============================================================================
// Public Validation Functions
// ============================================================================

/**
 * LogEvent schema validation
 *
 * @param event - LogEvent object to validate
 * @returns ValidationResult
 *
 * @example
 * ```ts
 * const result = validateLogEvent({
 *   level: 'INFO',
 *   message: 'File loaded',
 *   timestamp: '2024-01-15T10:30:00.000Z'
 * });
 * if (!result.valid) {
 *   console.error('Invalid LogEvent:', result.errors);
 * }
 * ```
 */
export function validateLogEvent(event: unknown): ValidationResult {
  const result = LogEventSchema.safeParse(event);

  if (result.success) {
    return { valid: true };
  }

  return {
    valid: false,
    errors: formatZodErrors(result.error),
  };
}

/**
 * AdapterError schema validation
 *
 * @param error - AdapterError object to validate
 * @returns ValidationResult
 *
 * @example
 * ```ts
 * const result = validateAdapterError({
 *   code: 'E_PARSE_FAILED',
 *   message: 'Invalid mesh data',
 *   severity: 'error',
 *   timestamp: '2024-01-15T10:30:00.000Z'
 * });
 * if (!result.valid) {
 *   console.error('Invalid AdapterError:', result.errors);
 * }
 * ```
 */
export function validateAdapterError(error: unknown): ValidationResult {
  const result = AdapterErrorSchema.safeParse(error);

  if (result.success) {
    return { valid: true };
  }

  return {
    valid: false,
    errors: formatZodErrors(result.error),
  };
}

/**
 * AdapterMetrics schema validation
 *
 * @param metrics - AdapterMetrics object to validate
 * @returns ValidationResult
 *
 * @example
 * ```ts
 * const result = validateAdapterMetrics({
 *   fileId: 'abc-123',
 *   parseTimeMs: 150.5,
 *   totalTimeMs: 200.0,
 *   vertexCount: 5000,
 *   triangleCount: 10000,
 *   parserMode: 'fast',
 *   fallbackCount: 0,
 *   bytesRead: 1048576
 * });
 * if (!result.valid) {
 *   console.error('Invalid AdapterMetrics:', result.errors);
 * }
 * ```
 */
export function validateAdapterMetrics(metrics: unknown): ValidationResult {
  const result = AdapterMetricsSchema.safeParse(metrics);

  if (result.success) {
    return { valid: true };
  }

  return {
    valid: false,
    errors: formatZodErrors(result.error),
  };
}

// ============================================================================
// Assertion Variants (throws on failure)
// ============================================================================

/**
 * Error thrown when validation fails
 */
export class SchemaValidationError extends Error {
  /** List of validation errors */
  public readonly validationErrors: ValidationError[];
  /** Schema name */
  public readonly schemaName: string;

  constructor(schemaName: string, errors: ValidationError[]) {
    const errorSummary = errors
      .map((e) => `${e.path}: ${e.message}`)
      .join('; ');
    super(`${schemaName} validation failed: ${errorSummary}`);

    this.name = 'SchemaValidationError';
    this.schemaName = schemaName;
    this.validationErrors = errors;
  }
}

/**
 * LogEvent schema validation (throws on failure)
 *
 * @param event - LogEvent object to validate
 * @throws SchemaValidationError
 */
export function assertValidLogEvent(event: unknown): asserts event is LogEvent {
  const result = validateLogEvent(event);
  if (!result.valid) {
    throw new SchemaValidationError('LogEvent', result.errors || []);
  }
}

/**
 * AdapterError schema validation (throws on failure)
 *
 * @param error - AdapterError object to validate
 * @throws SchemaValidationError
 */
export function assertValidAdapterError(error: unknown): asserts error is AdapterError {
  const result = validateAdapterError(error);
  if (!result.valid) {
    throw new SchemaValidationError('AdapterError', result.errors || []);
  }
}

/**
 * AdapterMetrics schema validation (throws on failure)
 *
 * @param metrics - AdapterMetrics object to validate
 * @throws SchemaValidationError
 */
export function assertValidAdapterMetrics(metrics: unknown): asserts metrics is AdapterMetrics {
  const result = validateAdapterMetrics(metrics);
  if (!result.valid) {
    throw new SchemaValidationError('AdapterMetrics', result.errors || []);
  }
}

// ============================================================================
// Parse Functions (returns typed data or throws)
// ============================================================================

/**
 * Parse and validate LogEvent
 * 
 * @param event - Data to parse
 * @returns Validated LogEvent
 * @throws z.ZodError
 */
export function parseLogEvent(event: unknown): LogEvent {
  return LogEventSchema.parse(event) as LogEvent;
}

/**
 * Parse and validate AdapterError
 * 
 * @param error - Data to parse
 * @returns Validated AdapterError
 * @throws z.ZodError
 */
export function parseAdapterError(error: unknown): AdapterError {
  return AdapterErrorSchema.parse(error) as AdapterError;
}

/**
 * Parse and validate AdapterMetrics
 * 
 * @param metrics - Data to parse
 * @returns Validated AdapterMetrics
 * @throws z.ZodError
 */
export function parseAdapterMetrics(metrics: unknown): AdapterMetrics {
  return AdapterMetricsSchema.parse(metrics) as AdapterMetrics;
}

// ============================================================================
// Development Mode Helpers
// ============================================================================

/**
 * Perform validation only in development mode
 *
 * Removed via tree-shaking in production builds
 *
 * @param schemaName - Schema name
 * @param data - Data to validate
 * @param validateFn - Validation function
 */
export function validateInDev<T>(
  schemaName: string,
  data: unknown,
  validateFn: (data: unknown) => ValidationResult
): void {
  if (process.env['NODE_ENV'] === 'development') {
    const result = validateFn(data);
    if (!result.valid) {
      console.warn(
        `[Schema Validation] ${schemaName} failed:`,
        result.errors
      );
    }
  }
}

// ============================================================================
// Type Inference Helpers
// ============================================================================

/**
 * Type inferred from LogEvent schema
 */
export type InferredLogEvent = z.infer<typeof LogEventSchema>;

/**
 * Type inferred from AdapterError schema
 */
export type InferredAdapterError = z.infer<typeof AdapterErrorSchema>;

/**
 * Type inferred from AdapterMetrics schema
 */
export type InferredAdapterMetrics = z.infer<typeof AdapterMetricsSchema>;

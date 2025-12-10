/**
 * ErrorFactory - AdapterError Creation Factory
 * 
 * This module provides factory functions to create AdapterError objects consistently.
 * All errors conform to the AdapterError.schema.json schema.
 * Schema validation is performed in development mode (T047).
 * 
 * @module error-factory
 */

import type { AdapterError, AdapterErrorCode, ErrorContext } from './types';
import { nowISO8601 } from './log-emitter';
import { validateAdapterError, validateInDev } from './schema-validator';

/**
 * AdapterError creation options
 */
export interface CreateErrorOptions {
  /** Error code */
  code: AdapterErrorCode;
  /** Error message */
  message: string;
  /** Severity (default: 'error') */
  severity?: 'error' | 'warn';
  /** Additional context */
  context?: ErrorContext;
}

/**
 * Create AdapterError
 * 
 * @param options - Error creation options
 * @returns AdapterError object
 * 
 * @example
 * ```typescript
 * const error = createAdapterError({
 *   code: 'E_EMPTY_FILE',
 *   message: 'File is empty',
 *   context: { fileName: 'model.stl' }
 * });
 * ```
 */
export function createAdapterError(options: CreateErrorOptions): AdapterError {
  const error: AdapterError = {
    code: options.code,
    message: options.message,
    severity: options.severity ?? 'error',
    timestamp: nowISO8601(),
    context: options.context
  };

  // Schema validation only in development mode (T047)
  validateInDev('AdapterError', error, validateAdapterError);

  return error;
}

// ============================================================================
// Factory functions for each error code
// ============================================================================

/**
 * Create E_EMPTY_FILE error
 */
export function createEmptyFileError(fileName?: string): AdapterError {
  return createAdapterError({
    code: 'E_EMPTY_FILE',
    message: 'File is empty (0 bytes)',
    context: fileName ? { fileName } : undefined
  });
}

/**
 * Create E_FILE_TOO_LARGE error
 */
export function createFileTooLargeError(
  fileName: string,
  fileSize: number,
  maxSize: number
): AdapterError {
  return createAdapterError({
    code: 'E_FILE_TOO_LARGE',
    message: `File exceeds maximum size: ${fileSize} bytes > ${maxSize} bytes`,
    context: { fileName }
  });
}

/**
 * Create E_FILE_READ_FAILED error
 */
export function createFileReadError(fileName: string, reason?: string): AdapterError {
  return createAdapterError({
    code: 'E_FILE_READ_FAILED',
    message: `Failed to read file: ${reason || 'unknown error'}`,
    context: { fileName, reason }
  });
}

/**
 * Create E_PARSE_FAILED error
 */
export function createParseError(fileName: string, reason?: string): AdapterError {
  return createAdapterError({
    code: 'E_PARSE_FAILED',
    message: `Failed to parse mesh: ${reason || 'unknown error'}`,
    context: { fileName, reason }
  });
}

/**
 * Create E_UNSUPPORTED_FORMAT error
 */
export function createUnsupportedFormatError(
  fileName: string,
  format?: string
): AdapterError {
  return createAdapterError({
    code: 'E_UNSUPPORTED_FORMAT',
    message: format 
      ? `Unsupported mesh format: ${format}`
      : 'Unable to detect mesh format',
    context: { fileName, format }
  });
}

/**
 * Create E_MEMORY_LIMIT error
 */
export function createMemoryLimitError(
  requiredBytes: number,
  availableBytes: number,
  fileName?: string
): AdapterError {
  return createAdapterError({
    code: 'E_MEMORY_LIMIT',
    message: `Memory limit exceeded: requires ${requiredBytes} bytes, only ${availableBytes} available`,
    context: { requiredBytes, availableBytes, fileName }
  });
}

/**
 * Create E_FETCH_FAILED error
 */
export function createFetchFailedError(url: string, reason?: string): AdapterError {
  return createAdapterError({
    code: 'E_FETCH_FAILED',
    message: `Failed to fetch: ${reason || 'network error'}`,
    context: { fileName: url, reason }
  });
}

/**
 * Create E_FETCH_TIMEOUT error
 */
export function createFetchTimeoutError(url: string, timeoutMs: number): AdapterError {
  return createAdapterError({
    code: 'E_FETCH_TIMEOUT',
    message: `Fetch timed out after ${timeoutMs}ms`,
    context: { fileName: url }
  });
}

/**
 * Create E_INVALID_MESH error
 */
export function createInvalidMeshError(fileName: string, reason?: string): AdapterError {
  return createAdapterError({
    code: 'E_INVALID_MESH',
    message: `Invalid mesh data: ${reason || 'validation failed'}`,
    context: { fileName, reason }
  });
}

/**
 * Create E_TOO_MANY_TRIANGLES error
 */
export function createTooManyTrianglesError(
  triangleCount: number,
  maxTriangles: number,
  fileName?: string
): AdapterError {
  return createAdapterError({
    code: 'E_TOO_MANY_TRIANGLES',
    message: `Triangle count exceeds limit: ${triangleCount} > ${maxTriangles}`,
    context: { triangleCount, maxTriangles, fileName }
  });
}

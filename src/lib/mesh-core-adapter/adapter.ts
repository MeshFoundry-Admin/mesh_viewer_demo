/**
 * MeshCoreAdapter - Single Entry Point Mesh Loader
 * 
 * User Story 1 (Priority: P1) Implementation
 * 
 * When a user (frontend developer) loads STL/OBJ/PLY files through the
 * `MeshCoreAdapter.load(file, options)` single entry point, it internally
 * detects file extension and MIME type, selects the appropriate parser,
 * and returns a normalized `MeshAsset` structure.
 * 
 * @module adapter
 */

import type {
  MeshAsset,
  MeshCoreCapabilities,
  MeshLoadResult,
  MeshFormat,
  LogEvent,
  AdapterError,
  LogContext
} from './types';
import { MAX_MESH_FILE_BYTES, MAX_TRIANGLE_COUNT } from './types';
import { LogEmitter, nowISO8601, type LogSubscription, type LogCallback } from './log-emitter';
import { MetricsCollector } from './metrics-collector';
import { generateFileId } from './file-id';
import {
  createEmptyFileError,
  createFileTooLargeError,
  createParseError,
  createUnsupportedFormatError,
  createTooManyTrianglesError,
} from './error-factory';
import { detectMeshFormat, isSupportedFormat } from './format-detector';
import {
  withSharedBufferTimeout,
  SHARED_BUFFER_TIMEOUT_MS
} from './shared-buffer-timeout';

// ============================================================================
// Types
// ============================================================================

/**
 * MeshCoreAdapter initialization options
 * 
 * @example
 * ```typescript
 * const adapter = await createMeshCoreAdapter({
 *   baseUrl: '/wasm'
 * });
 * ```
 */
export interface MeshCoreBootstrapOptions {
  /**
   * Base URL path for WASM module files
   * @default '/core'
   */
  baseUrl?: string;
}

/**
 * Mesh load options
 * 
 * @example
 * ```typescript
 * const result = await adapter.load(file, {
 *   computeNormals: true,
 *   enableFallback: true
 * });
 * ```
 */
export interface MeshLoadOptions {
  /**
   * Whether to automatically compute normal vectors
   * 
   * Default is false since Three.js renderer computes them faster.
   * Only set to true when precise normals are required.
   * 
   * @default false
   */
  computeNormals?: boolean;
  
  /**
   * Whether to enable Fast→Exact parser auto-fallback
   * 
   * Automatically retries with Exact mode when Fast mode parsing fails.
   * Fallback occurs at most once; if Exact mode also fails, returns E_PARSE_FAILED error.
   * 
   * @default true
   */
  enableFallback?: boolean;
}

// ============================================================================
// MeshCoreAdapter Class
// ============================================================================

/**
 * MeshCoreAdapter - Mesh Load Adapter
 * 
 * @example
 * ```typescript
 * const adapter = await createMeshCoreAdapter();
 * 
 * // Subscribe to logs
 * const subscription = adapter.onLog((event) => {
 *   console.log(event.level, event.message);
 * });
 * 
 * // Load file
 * const result = await adapter.load(file);
 * if (result.status === 'success') {
 *   console.log('Loaded:', result.asset.stats);
 * } else {
 *   console.error('Error:', result.error.code);
 * }
 * 
 * subscription.unsubscribe();
 * ```
 */
export class MeshCoreAdapter {
  private logEmitter: LogEmitter;
  private _capabilities: MeshCoreCapabilities;

  constructor() {
    this.logEmitter = new LogEmitter();
    this._capabilities = {
      binaryPlyEnabled: true,
      wasmVersion: '0.1.0'
    };
  }

  /**
   * Returns the feature information supported by the Adapter.
   * 
   * @returns Current Adapter's feature information (WASM version, Binary PLY support, etc.)
   * 
   * @example
   * ```typescript
   * const caps = adapter.capabilities;
   * console.log(`WASM Version: ${caps.wasmVersion}`);
   * console.log(`Binary PLY: ${caps.binaryPlyEnabled}`);
   * ```
   */
  get capabilities(): MeshCoreCapabilities {
    return this._capabilities;
  }

  // ==========================================================================
  // Log Subscription API (FR-007)
  // ==========================================================================

  /**
   * Log Event Subscription API (FR-007)
   * 
   * Allows upper layers (Viewer Demo, etc.) to receive log events in real-time.
   * Multiple subscribers can be registered, and memory leaks are prevented with WeakRef pattern.
   * 
   * @param callback - Callback function to receive log events. Each event conforms to LogEvent.schema.json.
   * @returns Unsubscribe handle. Call unsubscribe() to cancel the subscription.
   * 
   * @example
   * ```typescript
   * // Subscribe to logs
   * const subscription = adapter.onLog((event) => {
   *   console.log(`[${event.level}] ${event.message}`);
   *   if (event.context?.elapsed_ms) {
   *     console.log(`  Elapsed: ${event.context.elapsed_ms}ms`);
   *   }
   * });
   * 
   * // Load file
   * await adapter.load(file);
   * 
   * // Unsubscribe
   * subscription.unsubscribe();
   * ```
   * 
   * @see LogEvent - Log event type
   */
  onLog(callback: LogCallback): LogSubscription {
    return this.logEmitter.subscribe(callback);
  }

  // ==========================================================================
  // Internal Logging
  // ==========================================================================

  private emitLog(
    level: LogEvent['level'],
    message: string,
    context?: LogContext
  ): void {
    const event: LogEvent = {
      level,
      message,
      timestamp: nowISO8601(),
      context
    };
    this.logEmitter.emit(event);
  }

  // ==========================================================================
  // Load API (FR-001, FR-002)
  // ==========================================================================

  /**
   * Mesh File Load - Single Entry Point API (FR-001, FR-002)
   * 
   * Loads STL, OBJ, PLY format 3D mesh files and returns a normalized MeshAsset.
   * Auto-detects format based on file extension and Magic Bytes,
   * and supports Fast→Exact parser fallback.
   * 
   * @param file - File object to load (Browser File API)
   * @param options - Load options (normal computation, fallback enable, etc.)
   * @returns Promise<MeshLoadResult> containing load result
   *          - status='success': includes asset, metrics, logs
   *          - status='error': includes error, metrics, logs
   * 
   * @throws This method does not throw exceptions. All errors are returned via MeshLoadResult.error.
   * 
   * @example
   * ```typescript
   * const result = await adapter.load(file);
   * 
   * if (result.status === 'success') {
   *   console.log('Loaded:', result.asset.fileName);
   *   console.log('Triangles:', result.asset.stats?.triangles);
   *   console.log('Parse time:', result.metrics.parseTimeMs, 'ms');
   * } else {
   *   console.error('Error:', result.error.code, result.error.message);
   *   // E_EMPTY_FILE, E_FILE_TOO_LARGE, E_PARSE_FAILED, etc.
   * }
   * 
   * // Metrics and logs are always included regardless of success/failure
   * console.log('Total time:', result.metrics.totalTimeMs, 'ms');
   * console.log('Logs:', result.logs.length, 'events');
   * ```
   * 
   * @see MeshLoadResult - Result type
   * @see MeshAsset - Loaded asset type
   * @see AdapterError - Error type
   */
  async load(file: File, options: MeshLoadOptions = {}): Promise<MeshLoadResult> {
    const fileId = generateFileId(file.name);
    const metrics = new MetricsCollector(fileId);
    
    // Start timer
    metrics.startTotal();
    
    // Log start
    this.emitLog('DEBUG', `Load started: ${file.name}`, {
      category: 'io',
      op: 'load_start',
      fileId
    });

    try {
      // =======================================================================
      // Step 1: File Validation
      // =======================================================================
      
      // Empty file check (US1-3)
      if (file.size === 0) {
        const error = createEmptyFileError(file.name);
        this.emitLog('ERROR', error.message, {
          category: 'io',
          op: 'load_validate',
          code: error.code,
          fileId
        });
        metrics.stopTotal();
        return this.buildErrorResult(error, metrics, this.logEmitter.getLogs());
      }

      // File size check
      if (file.size > MAX_MESH_FILE_BYTES) {
        const error = createFileTooLargeError(file.name, file.size, MAX_MESH_FILE_BYTES);
        this.emitLog('ERROR', error.message, {
          category: 'io',
          op: 'load_validate',
          code: error.code,
          fileId
        });
        metrics.stopTotal();
        return this.buildErrorResult(error, metrics, this.logEmitter.getLogs());
      }

      metrics.setBytesRead(file.size);

      // =======================================================================
      // Step 2: Format Detection (FR-001)
      // =======================================================================
      
      const detection = await detectMeshFormat(file);
      
      // Format mismatch warning (US1-2)
      if (detection.mismatch) {
        this.emitLog('WARN', `Format mismatch: expected ${detection.expectedFormat} but detected ${detection.format}`, {
          category: 'adapter',
          op: 'detect_format',
          fileId
        });
      }

      if (!isSupportedFormat(detection.format)) {
        const error = createUnsupportedFormatError(file.name, detection.format ?? undefined);
        this.emitLog('ERROR', error.message, {
          category: 'adapter',
          op: 'detect_format',
          code: error.code,
          fileId
        });
        metrics.stopTotal();
        return this.buildErrorResult(error, metrics, this.logEmitter.getLogs());
      }

      this.emitLog('DEBUG', `Format detected: ${detection.format} (method: ${detection.method})`, {
        category: 'adapter',
        op: 'detect_format',
        fileId
      });

      // =======================================================================
      // Step 3: File Reading and Parsing (with Fast→Exact fallback)
      // =======================================================================
      
      metrics.startParse();
      
      const parseResult = await this.parseFile(file, detection.format!, options, metrics, fileId);
      
      metrics.stopParse();
      metrics.setParserMode(parseResult.parserMode);
      
      if (parseResult.fallbackOccurred) {
        // metrics.recordFallback() already called when fallback occurred
        this.emitLog('DEBUG', 'Parser fallback was triggered', {
          category: 'robustness',
          op: 'fallback_recorded',
          fileId
        });
      }
      
      if (!parseResult.success) {
        const error = createParseError(file.name, parseResult.error);
        this.emitLog('ERROR', error.message, {
          category: 'adapter',
          op: 'parse_mesh',
          code: error.code,
          elapsed_ms: metrics.getParseTimeMs(),
          fileId
        });
        metrics.stopTotal();
        return this.buildErrorResult(error, metrics, this.logEmitter.getLogs());
      }

      // =======================================================================
      // Step 4: MeshAsset Creation and Validation
      // =======================================================================
      
      const asset = parseResult.asset!;
      
      // Triangle count check
      if (asset.stats && asset.stats.triangles > MAX_TRIANGLE_COUNT) {
        const error = createTooManyTrianglesError(
          asset.stats.triangles,
          MAX_TRIANGLE_COUNT,
          file.name
        );
        this.emitLog('ERROR', error.message, {
          category: 'adapter',
          op: 'validate_mesh',
          code: error.code,
          fileId
        });
        metrics.stopTotal();
        return this.buildErrorResult(error, metrics, this.logEmitter.getLogs());
      }

      // Set metrics
      metrics.setVertexCount(asset.stats?.vertices ?? 0);
      metrics.setTriangleCount(asset.stats?.triangles ?? 0);
      metrics.stopTotal();

      // Success log (US1-1)
      this.emitLog('INFO', `Load successful: ${file.name}`, {
        category: 'io',
        op: 'load_complete',
        elapsed_ms: metrics.getTotalTimeMs(),
        fileId
      });

      return this.buildSuccessResult(asset, metrics, this.logEmitter.getLogs());

    } catch (err) {
      metrics.stopTotal();
      
      const errorMessage = err instanceof Error ? err.message : String(err);
      const error = createParseError(file.name, errorMessage);
      
      this.emitLog('ERROR', `Load failed: ${errorMessage}`, {
        category: 'adapter',
        op: 'load_error',
        code: error.code,
        fileId
      });

      return this.buildErrorResult(error, metrics, this.logEmitter.getLogs());
    }
  }

  // ==========================================================================
  // Internal Parsing with Fast→Exact Fallback (US2)
  // ==========================================================================

  private async parseFile(
    file: File,
    format: MeshFormat,
    options: MeshLoadOptions,
    metrics: MetricsCollector,
    fileId: string
  ): Promise<{
    success: boolean;
    asset?: MeshAsset;
    error?: string;
    parserMode: 'fast' | 'exact';
    fallbackOccurred: boolean;
  }> {
    // Read file data
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    
    const enableFallback = options.enableFallback !== false;

    // =======================================================================
    // Fast mode attempt (T035)
    // =======================================================================
    
    this.emitLog('DEBUG', 'Attempting Fast mode parsing', {
      category: 'adapter',
      op: 'parse_fast_start',
      fileId
    });
    
    const fastStartTime = performance.now();
    
    try {
      const asset = await this.parseWithMode(file, data, format, 'fast', fileId);
      
      // Fast mode validation
      const validation = this.validateParsedMesh(asset);
      
      if (validation.valid) {
        const fastElapsed = performance.now() - fastStartTime;
        this.emitLog('DEBUG', `Fast mode parsing successful (${fastElapsed.toFixed(2)}ms)`, {
          category: 'adapter',
          op: 'parse_fast_complete',
          elapsed_ms: fastElapsed,
          fileId
        });
        
        return { 
          success: true, 
          asset, 
          parserMode: 'fast',
          fallbackOccurred: false
        };
      }
      
      // Fast mode validation failed - fallback needed
      if (!enableFallback) {
        return {
          success: false,
          error: `Fast mode validation failed: ${validation.reason}`,
          parserMode: 'fast',
          fallbackOccurred: false
        };
      }
      
      this.emitLog('WARN', `Fast mode validation failed: ${validation.reason}. Triggering Exact fallback.`, {
        category: 'robustness',
        op: 'fallback_exact',
        elapsed_ms: performance.now() - fastStartTime,
        fileId
      });
      
    } catch (fastError) {
      const fastErrorMsg = fastError instanceof Error ? fastError.message : String(fastError);
      
      if (!enableFallback) {
        return {
          success: false,
          error: fastErrorMsg,
          parserMode: 'fast',
          fallbackOccurred: false
        };
      }
      
      // Fast mode failed - trigger fallback (T036, T037)
      this.emitLog('WARN', `Fast mode parsing failed: ${fastErrorMsg}. Triggering Exact fallback.`, {
        category: 'robustness',
        op: 'fallback_exact',
        elapsed_ms: performance.now() - fastStartTime,
        fileId
      });
    }

    // =======================================================================
    // Exact mode fallback (T036, T038)
    // =======================================================================
    
    metrics.recordFallback(); // fallbackCount = 1
    
    this.emitLog('DEBUG', 'Attempting Exact mode parsing', {
      category: 'adapter',
      op: 'parse_exact_start',
      fileId
    });
    
    const exactStartTime = performance.now();
    
    try {
      const asset = await this.parseWithMode(file, data, format, 'exact', fileId);
      
      const exactElapsed = performance.now() - exactStartTime;
      this.emitLog('INFO', `Exact mode parsing successful after fallback (${exactElapsed.toFixed(2)}ms)`, {
        category: 'adapter',
        op: 'parse_exact_complete',
        elapsed_ms: exactElapsed,
        fileId
      });
      
      return { 
        success: true, 
        asset, 
        parserMode: 'exact',
        fallbackOccurred: true
      };
      
    } catch (exactError) {
      // Exact mode also failed - final error (T038)
      const exactErrorMsg = exactError instanceof Error ? exactError.message : String(exactError);
      
      this.emitLog('ERROR', `Exact mode parsing also failed: ${exactErrorMsg}`, {
        category: 'adapter',
        op: 'parse_exact_failed',
        elapsed_ms: performance.now() - exactStartTime,
        fileId
      });
      
      return {
        success: false,
        error: `Both Fast and Exact parsing failed. Last error: ${exactErrorMsg}`,
        parserMode: 'exact',
        fallbackOccurred: true
      };
    }
  }

  /**
   * Execute parsing with specific mode
   * 
   * Monitors SharedArrayBuffer lock delay and emits WARN log after 30 second timeout.
   * Operation continues even after timeout.
   * 
   */
  private async parseWithMode(
    file: File,
    data: Uint8Array,
    format: MeshFormat,
    mode: 'fast' | 'exact',
    fileId?: string
  ): Promise<MeshAsset> {
    const id = fileId ?? generateFileId(file.name);
    
    // SharedArrayBuffer timeout monitoring (T052)
    const { value: asset, timedOut, elapsedMs } = await withSharedBufferTimeout(
      async () => {
        const startTime = performance.now();
        
        // TODO: Integrate actual parsing logic (parseWithJs/parseWithWasm from mesh-loader.ts)
        // Use more precise parsing algorithm when mode === 'exact'
        
        // Create basic buffer structure
        const vertices = new Float64Array(0);
        const indices = new Uint32Array(0);
        
        const loadDurationMs = performance.now() - startTime;
        
        const meshAsset: MeshAsset = {
          id,
          fileName: file.name,
          fileSizeBytes: file.size,
          format,
          loadedAt: Date.now(),
          loadDurationMs,
          buffers: {
            vertexView: vertices,
            indexView: indices,
            generation: 1,
            release: () => {
              // Buffer release logic
            }
          },
          stats: {
            vertices: vertices.length / 3,
            triangles: indices.length / 3,
            bbox: {
              min: [0, 0, 0],
              max: [0, 0, 0]
            },
            diagonalLength: 0
          }
        };
        
        return meshAsset;
      },
      {
        timeoutMs: SHARED_BUFFER_TIMEOUT_MS,
        onTimeoutWarning: (timeoutElapsedMs) => {
          // SharedArrayBuffer lock timeout WARN log (T052)
          this.emitLog('WARN', `SharedArrayBuffer lock timeout after ${timeoutElapsedMs}ms. Browser tab may be inactive. Continuing operation.`, {
            category: 'wasm',
            op: 'shared_buffer_timeout',
            elapsed_ms: timeoutElapsedMs,
            fileId: id
          });
        },
        continueAfterTimeout: true // spec: operation continues
      }
    );
    
    // Additional debug log when timeout occurred
    if (timedOut) {
      this.emitLog('DEBUG', `Parse completed after SharedArrayBuffer timeout. Total elapsed: ${elapsedMs.toFixed(2)}ms`, {
        category: 'wasm',
        op: 'parse_after_timeout',
        elapsed_ms: elapsedMs,
        fileId: id
      });
    }
    
    return asset;
  }

  /**
   * Validate parsed mesh
   */
  private validateParsedMesh(asset: MeshAsset): { valid: boolean; reason?: string } {
    // Vertex count check
    if (!asset.stats || asset.stats.vertices === 0) {
      return { valid: false, reason: 'No vertices found' };
    }
    
    // Triangle count check
    if (asset.stats.triangles === 0) {
      return { valid: false, reason: 'No triangles found' };
    }
    
    // TODO: Additional validation such as winding-number consistency check
    
    return { valid: true };
  }

  // ==========================================================================
  // Result Builders
  // ==========================================================================

  private buildSuccessResult(
    asset: MeshAsset,
    metrics: MetricsCollector,
    logs: readonly LogEvent[]
  ): MeshLoadResult {
    return {
      status: 'success',
      asset,
      metrics: metrics.collect(),
      logs: [...logs]
    };
  }

  private buildErrorResult(
    error: AdapterError,
    metrics: MetricsCollector,
    logs: readonly LogEvent[]
  ): MeshLoadResult {
    return {
      status: 'error',
      error,
      metrics: metrics.collect(),
      logs: [...logs]
    };
  }

  // ==========================================================================
  // Asset Management
  // ==========================================================================

  /**
   * Returns a list of currently cached assets.
   * 
   * @returns Array of loaded MeshAssets (currently empty array - cache not implemented)
   * 
   * @example
   * ```typescript
   * const assets = adapter.listAssets();
   * assets.forEach(asset => {
   *   console.log(`${asset.fileName}: ${asset.stats?.triangles} triangles`);
   * });
   * ```
   * 
   * @todo Asset cache implementation planned
   */
  listAssets(): MeshAsset[] {
    return [];
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates and initializes a MeshCoreAdapter instance.
 * 
 * Loads the WASM module and prepares the Adapter for use.
 * This function is asynchronous, and the Adapter can be used once the returned Promise resolves.
 * 
 * @param options - Bootstrap options (WASM path, etc.)
 * @returns Initialized MeshCoreAdapter instance
 * 
 * @example
 * ```typescript
 * // Create with default settings
 * const adapter = await createMeshCoreAdapter();
 * 
 * // Create with custom WASM path
 * const adapter = await createMeshCoreAdapter({
 *   baseUrl: '/assets/wasm'
 * });
 * 
 * // Usage
 * const result = await adapter.load(file);
 * ```
 * 
 * @see MeshCoreAdapter
 * @see MeshCoreBootstrapOptions
 */
export async function createMeshCoreAdapter(
  options: MeshCoreBootstrapOptions = {}
): Promise<MeshCoreAdapter> {
  const { baseUrl = '/core' } = options;
  
  const adapter = new MeshCoreAdapter();
  
  // TODO: Load WASM module
  // await adapter.initWasm(baseUrl);
  
  return adapter;
}

/**
 * MetricsCollector - Performance/Quality Metrics Collector
 * 
 * This module uses performance.now() to collect
 * high-precision timing measurements.
 * Schema validation is performed in development mode (T048).
 * 
 * Timing Points:
 * 1. load() call starts
 * 2. File read complete
 * 3. Format detection complete
 * 4. Parsing starts (Fast mode)
 * 5. Parsing complete or fallback triggered
 * 6. (On fallback) Exact mode parsing complete
 * 7. MeshAsset creation complete
 * 
 * @module metrics-collector
 */

import type { AdapterMetrics } from './types';
import { validateAdapterMetrics, validateInDev } from './schema-validator';

/**
 * Timer State
 */
interface TimerState {
  startTime: number | null;
  endTime: number | null;
}

/**
 * MetricsCollector - Metrics Collector
 * 
 * @example
 * ```typescript
 * const collector = new MetricsCollector('uuid-123');
 * 
 * collector.startTotal();
 * // ... file reading ...
 * collector.startParse();
 * // ... parsing ...
 * collector.stopParse();
 * collector.stopTotal();
 * 
 * collector.setParserMode('fast');
 * collector.setCounts(1000, 500, 1024);
 * 
 * const metrics = collector.collect();
 * ```
 */
export class MetricsCollector {
  private fileId: string;
  private totalTimer: TimerState = { startTime: null, endTime: null };
  private parseTimer: TimerState = { startTime: null, endTime: null };
  
  private vertexCount = 0;
  private triangleCount = 0;
  private bytesRead = 0;
  private parserMode: 'fast' | 'exact' = 'fast';
  private fallbackCount = 0;

  constructor(fileId: string) {
    this.fileId = fileId;
  }

  // ============================================================================
  // Timer API
  // ============================================================================

  /**
   * Start total load timer
   */
  startTotal(): void {
    this.totalTimer.startTime = performance.now();
  }

  /**
   * Stop total load timer
   */
  stopTotal(): void {
    this.totalTimer.endTime = performance.now();
  }

  /**
   * Start parsing timer
   */
  startParse(): void {
    this.parseTimer.startTime = performance.now();
  }

  /**
   * Stop parsing timer
   */
  stopParse(): void {
    this.parseTimer.endTime = performance.now();
  }

  /**
   * Calculate timer elapsed time (ms)
   */
  private getElapsedMs(timer: TimerState): number {
    if (timer.startTime === null) return 0;
    const endTime = timer.endTime ?? performance.now();
    return endTime - timer.startTime;
  }

  // ============================================================================
  // Metrics Configuration API
  // ============================================================================

  /**
   * Set parser mode
   */
  setParserMode(mode: 'fast' | 'exact'): void {
    this.parserMode = mode;
  }

  /**
   * Record fallback occurrence
   */
  recordFallback(): void {
    if (this.fallbackCount < 1) {
      this.fallbackCount++;
    }
  }

  /**
   * Set counts
   */
  setCounts(vertexCount: number, triangleCount: number, bytesRead: number): void {
    this.vertexCount = vertexCount;
    this.triangleCount = triangleCount;
    this.bytesRead = bytesRead;
  }

  /**
   * Set vertex count
   */
  setVertexCount(count: number): void {
    this.vertexCount = count;
  }

  /**
   * Set triangle count
   */
  setTriangleCount(count: number): void {
    this.triangleCount = count;
  }

  /**
   * Set bytes read
   */
  setBytesRead(bytes: number): void {
    this.bytesRead = bytes;
  }

  // ============================================================================
  // Collection API
  // ============================================================================

  /**
   * Return collected metrics
   * 
   * @returns AdapterMetrics object
   */
  collect(): AdapterMetrics {
    const metrics: AdapterMetrics = {
      fileId: this.fileId,
      parseTimeMs: Math.round(this.getElapsedMs(this.parseTimer) * 100) / 100,
      totalTimeMs: Math.round(this.getElapsedMs(this.totalTimer) * 100) / 100,
      vertexCount: this.vertexCount,
      triangleCount: this.triangleCount,
      parserMode: this.parserMode,
      fallbackCount: this.fallbackCount,
      bytesRead: this.bytesRead
    };

    // Schema validation only in development mode (T048)
    validateInDev('AdapterMetrics', metrics, validateAdapterMetrics);

    return metrics;
  }

  /**
   * Return current parsing time (ms)
   */
  getParseTimeMs(): number {
    return this.getElapsedMs(this.parseTimer);
  }

  /**
   * Return current total time (ms)
   */
  getTotalTimeMs(): number {
    return this.getElapsedMs(this.totalTimer);
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.totalTimer = { startTime: null, endTime: null };
    this.parseTimer = { startTime: null, endTime: null };
    this.vertexCount = 0;
    this.triangleCount = 0;
    this.bytesRead = 0;
    this.parserMode = 'fast';
    this.fallbackCount = 0;
  }
}

/**
 * MetricsCollector creation helper
 */
export function createMetricsCollector(fileId: string): MetricsCollector {
  return new MetricsCollector(fileId);
}

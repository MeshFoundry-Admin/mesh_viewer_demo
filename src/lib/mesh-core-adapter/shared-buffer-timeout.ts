/**
 * SharedArrayBuffer Lock Timeout Monitoring Utility
 *
 * When browser tabs become inactive, Worker execution may be suspended,
 * causing SharedArrayBuffer locks to be delayed. This module emits a WARN log
 * after a 30-second timeout while allowing the operation to continue.
 *
 * @module shared-buffer-timeout
 */

/**
 * SharedArrayBuffer lock timeout constant (30 seconds)
 */
export const SHARED_BUFFER_TIMEOUT_MS = 30_000;

/**
 * Timeout warning callback type
 */
export type TimeoutWarningCallback = (elapsedMs: number) => void;

/**
 * SharedArrayBuffer Lock Monitor Interface
 *
 * Monitors long-running SharedArrayBuffer operations
 * and emits warnings on timeout.
 */
export interface SharedBufferLockMonitor {
  /**
   * Start monitoring
   */
  start(): void;

  /**
   * Stop monitoring and cleanup
   */
  stop(): void;

  /**
   * Returns elapsed time (milliseconds)
   */
  getElapsedMs(): number;

  /**
   * Returns whether timeout has occurred
   */
  hasTimedOut(): boolean;
}

/**
 * SharedBufferLockMonitor creation options
 */
export interface SharedBufferLockMonitorOptions {
  /**
   * Timeout threshold (milliseconds)
   * @default 30000 (30 seconds)
   */
  timeoutMs?: number;

  /**
   * Timeout warning callback
   * Called when timeout occurs.
   */
  onTimeoutWarning?: TimeoutWarningCallback;

  /**
   * Whether to continue operation after timeout
   * @default true (per spec requirements)
   */
  continueAfterTimeout?: boolean;
}

/**
 * Creates a SharedArrayBuffer lock monitor
 *
 * Monitors SharedArrayBuffer lock delays caused by browser tab inactivity.
 * Calls the WARN callback after a 30-second timeout while allowing the operation to continue.
 *
 * @param options - Monitor options
 * @returns SharedBufferLockMonitor instance
 *
 * @example
 * ```typescript
 * const monitor = createSharedBufferLockMonitor({
 *   onTimeoutWarning: (elapsedMs) => {
 *     logEmitter.emit({
 *       level: 'WARN',
 *       message: `SharedArrayBuffer lock timeout after ${elapsedMs}ms`,
 *       timestamp: nowISO8601(),
 *       context: { category: 'wasm', op: 'shared_buffer_timeout', elapsed_ms: elapsedMs }
 *     });
 *   }
 * });
 *
 * monitor.start();
 * try {
 *   await wasmOperation();
 * } finally {
 *   monitor.stop();
 * }
 * ```
 */
export function createSharedBufferLockMonitor(
  options: SharedBufferLockMonitorOptions = {}
): SharedBufferLockMonitor {
  const {
    timeoutMs = SHARED_BUFFER_TIMEOUT_MS,
    onTimeoutWarning,
    continueAfterTimeout = true
  } = options;

  let startTime: number | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  return {
    start(): void {
      if (startTime !== null) {
        // Already started
        return;
      }

      startTime = performance.now();
      timedOut = false;

      // Set timeout timer
      timeoutId = setTimeout(() => {
        timedOut = true;
        const elapsedMs = this.getElapsedMs();

        // Call warning callback
        if (onTimeoutWarning) {
          onTimeoutWarning(elapsedMs);
        }

        // Since continueAfterTimeout=true, operation continues
        // (timer expires only, no forced interruption)
      }, timeoutMs);
    },

    stop(): void {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      // Keep startTime for getElapsedMs() calculation
    },

    getElapsedMs(): number {
      if (startTime === null) {
        return 0;
      }
      return performance.now() - startTime;
    },

    hasTimedOut(): boolean {
      return timedOut;
    }
  };
}

/**
 * Promise-based SharedArrayBuffer operation wrapper
 *
 * Wraps async WASM operations with 30-second timeout monitoring.
 * Only logs a WARN on timeout while allowing the operation to continue.
 *
 * @template T - Operation result type
 * @param operation - Async operation to execute
 * @param options - Monitor options
 * @returns Object containing operation result and timeout status
 *
 * @example
 * ```typescript
 * const result = await withSharedBufferTimeout(
 *   () => wasmModule.parseSTL(buffer),
 *   {
 *     onTimeoutWarning: (elapsedMs) => {
 *       console.warn(`SharedArrayBuffer lock timeout: ${elapsedMs}ms`);
 *     }
 *   }
 * );
 *
 * if (result.timedOut) {
 *   console.warn('Operation continued after timeout');
 * }
 * console.log('Result:', result.value);
 * ```
 */
export async function withSharedBufferTimeout<T>(
  operation: () => Promise<T>,
  options: SharedBufferLockMonitorOptions = {}
): Promise<{ value: T; timedOut: boolean; elapsedMs: number }> {
  const monitor = createSharedBufferLockMonitor(options);

  monitor.start();
  try {
    const value = await operation();
    return {
      value,
      timedOut: monitor.hasTimedOut(),
      elapsedMs: monitor.getElapsedMs()
    };
  } finally {
    monitor.stop();
  }
}

/**
 * Atomics.wait timeout wrapper
 *
 * Applies a 30-second timeout when using Atomics.wait on SharedArrayBuffer.
 * Calls the callback on timeout and returns 'timed-out' result.
 *
 * @param typedArray - Int32Array (SharedArrayBuffer-based)
 * @param index - Index to wait on
 * @param value - Expected value
 * @param options - Monitor options
 * @returns Atomics.wait result and timeout information
 *
 * @example
 * ```typescript
 * const sharedBuffer = new SharedArrayBuffer(4);
 * const int32 = new Int32Array(sharedBuffer);
 *
 * const result = atomicsWaitWithTimeout(int32, 0, 0, {
 *   onTimeoutWarning: (elapsedMs) => {
 *     console.warn(`Atomics.wait timeout: ${elapsedMs}ms`);
 *   }
 * });
 *
 * if (result.timedOut) {
 *   console.warn('Wait timed out, continuing...');
 * }
 * ```
 */
export function atomicsWaitWithTimeout(
  typedArray: Int32Array,
  index: number,
  value: number,
  options: SharedBufferLockMonitorOptions = {}
): { result: 'ok' | 'not-equal' | 'timed-out'; timedOut: boolean; elapsedMs: number } {
  const { timeoutMs = SHARED_BUFFER_TIMEOUT_MS, onTimeoutWarning } = options;

  const startTime = performance.now();

  // Pass timeout directly to Atomics.wait
  const result = Atomics.wait(typedArray, index, value, timeoutMs);

  const elapsedMs = performance.now() - startTime;
  const timedOut = result === 'timed-out';

  // Call warning callback on timeout
  if (timedOut && onTimeoutWarning) {
    onTimeoutWarning(elapsedMs);
  }

  return { result, timedOut, elapsedMs };
}

/**
 * WASM Log Bridge
 *
 * Bridges log events from C++ WASM module to TypeScript LogEmitter.
 *
 * This module converts C++ AdapterLogEvent objects exposed via Embind
 * into TypeScript LogEvent and forwards them to LogEmitter.
 *
 * @module wasm-log-bridge
 */

import type { LogEvent, LogLevel, LogContext } from './types';
import { LogEmitter } from './log-emitter';
import { validateLogEvent } from './schema-validator';

/**
 * AdapterLogEvent structure returned from C++ Embind
 * (matches value_object in bindings.cpp)
 */
export interface WasmAdapterLogEvent {
  level: string;
  message: string;
  timestamp: string;
  category: string;
  op: string;
  elapsed_ms: number;
  code: string;
  fileId: string;
}

/**
 * Converts C++ level string to TypeScript LogLevel
 */
function mapLevel(level: string): LogLevel {
  const normalized = level.toUpperCase();
  if (normalized === 'DEBUG' || normalized === 'INFO' || normalized === 'WARN' || normalized === 'ERROR') {
    return normalized as LogLevel;
  }
  return 'DEBUG'; // fallback
}

/**
 * Convert WASM AdapterLogEvent to TypeScript LogEvent
 *
 * @param wasmEvent - Event returned from C++ Embind
 * @returns TypeScript LogEvent
 */
export function convertWasmLogEvent(wasmEvent: WasmAdapterLogEvent): LogEvent {
  const context: LogContext = {};

  // Only add to context if not an empty string
  if (wasmEvent.category) {
    context.category = wasmEvent.category as LogContext['category'];
  }
  if (wasmEvent.op) {
    context.op = wasmEvent.op;
  }
  if (wasmEvent.elapsed_ms > 0) {
    context.elapsed_ms = wasmEvent.elapsed_ms;
  }
  if (wasmEvent.code) {
    context.code = wasmEvent.code;
  }
  if (wasmEvent.fileId) {
    context.fileId = wasmEvent.fileId;
  }

  const logEvent: LogEvent = {
    level: mapLevel(wasmEvent.level),
    message: wasmEvent.message,
    timestamp: wasmEvent.timestamp,
    context: Object.keys(context).length > 0 ? context : undefined,
  };

  return logEvent;
}

/**
 * WasmLogBridge - WASM Log Bridge
 *
 * Connects logs from C++ WASM module to TypeScript LogEmitter.
 *
 * @example
 * ```typescript
 * const emitter = new LogEmitter();
 * const bridge = new WasmLogBridge(emitter);
 *
 * // Register callback during WASM module initialization
 * wasmModule.setLogCallback((event: WasmAdapterLogEvent) => {
 *   bridge.onWasmLog(event);
 * });
 * ```
 */
export class WasmLogBridge {
  private emitter: LogEmitter;
  private validateEvents: boolean;

  /**
   * @param emitter - LogEmitter instance to forward logs to
   * @param validateEvents - Enable event validation (for development mode, default: false)
   */
  constructor(emitter: LogEmitter, validateEvents = false) {
    this.emitter = emitter;
    this.validateEvents = validateEvents;
  }

  /**
   * Called when receiving log events from WASM
   *
   * @param wasmEvent - Event returned from C++ Embind
   */
  onWasmLog(wasmEvent: WasmAdapterLogEvent): void {
    try {
      const logEvent = convertWasmLogEvent(wasmEvent);

      if (this.validateEvents) {
        const result = validateLogEvent(logEvent);
        if (!result.valid) {
          console.warn('[WasmLogBridge] Invalid log event from WASM:', result.errors);
          // Forward anyway even if invalid (to prevent log loss)
        }
      }

      this.emitter.emit(logEvent);
    } catch (err) {
      console.error('[WasmLogBridge] Failed to process WASM log:', err);
    }
  }

  /**
   * Process WASM batch logs
   *
   * Used for processing multiple logs at once for performance optimization
   *
   * @param wasmEvents - Array of events returned from C++ Embind
   */
  onWasmLogBatch(wasmEvents: WasmAdapterLogEvent[]): void {
    for (const event of wasmEvents) {
      this.onWasmLog(event);
    }
  }
}

/**
 * Helper to register log callback with WASM module
 *
 * @param wasmModule - WASM module instance created via Embind
 * @param bridge - WasmLogBridge instance
 */
export function registerWasmLogCallback(
  wasmModule: { setLogCallback?: (callback: (event: WasmAdapterLogEvent) => void) => void },
  bridge: WasmLogBridge
): void {
  if (typeof wasmModule.setLogCallback === 'function') {
    wasmModule.setLogCallback((event: WasmAdapterLogEvent) => {
      bridge.onWasmLog(event);
    });
  } else {
    console.warn('[WasmLogBridge] WASM module does not support setLogCallback');
  }
}

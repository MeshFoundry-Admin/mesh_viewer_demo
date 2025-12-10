/**
 * LogEmitter - Observer pattern based log event dispatcher
 * 
 * This module uses the Observer pattern with WeakRef to
 * dispatch log events to subscribers.
 * 
 * Key features:
 * - Memory leak prevention via WeakRef
 * - Multiple subscriber support
 * - Subscriber errors do not affect other subscribers
 * - Schema validation in development mode (T046)
 * 
 * @module log-emitter
 */

import type { LogEvent, LogContext } from './types';
import { validateLogEvent, validateInDev } from './schema-validator';

/**
 * Log subscription handle
 */
export interface LogSubscription {
  /** Unsubscribe from log events */
  unsubscribe(): void;
}

/**
 * Log callback function type
 */
export type LogCallback = (event: LogEvent) => void;

/**
 * Generate ISO 8601 UTC timestamp
 */
export function nowISO8601(): string {
  return new Date().toISOString();
}

/**
 * LogEmitter - Log event emitter/dispatcher
 * 
 * @example
 * ```typescript
 * const emitter = new LogEmitter();
 * 
 * const subscription = emitter.subscribe((event) => {
 *   console.log(event.level, event.message);
 * });
 * 
 * emitter.emit({
 *   level: 'INFO',
 *   message: 'File loaded successfully',
 *   timestamp: nowISO8601(),
 *   context: { category: 'io', op: 'load_file' }
 * });
 * 
 * subscription.unsubscribe();
 * ```
 */
export class LogEmitter {
  private subscribers: Set<WeakRef<LogCallback>> = new Set();
  private logs: LogEvent[] = [];
  private maxBufferSize = 1000;

  /**
   * Subscribe to log events
   * 
   * @param callback - Callback function to receive log events
   * @returns Subscription handle for unsubscribing
   */
  subscribe(callback: LogCallback): LogSubscription {
    const ref = new WeakRef(callback);
    this.subscribers.add(ref);
    
    return {
      unsubscribe: () => {
        this.subscribers.delete(ref);
      }
    };
  }

  /**
   * Emit a log event
   * 
   * Delivers the event to all subscribers.
   * Individual subscriber errors do not affect other subscribers.
   * Schema validation is performed in development mode.
   * 
   * @param event - Log event to emit
   */
  emit(event: LogEvent): void {
    // Schema validation in development mode only (T046)
    validateInDev('LogEvent', event, validateLogEvent);
    
    // Store in buffer
    this.logs.push(event);
    
    // Limit buffer size
    if (this.logs.length > this.maxBufferSize) {
      this.logs.shift();
    }
    
    // Deliver to subscribers
    for (const ref of this.subscribers) {
      const callback = ref.deref();
      if (callback) {
        try {
          callback(event);
        } catch (err) {
          // Ignore subscriber errors and continue delivering to other subscribers
          console.error('[LogEmitter] Subscriber error:', err);
        }
      } else {
        // Remove from Set when WeakRef has been garbage collected
        this.subscribers.delete(ref);
      }
    }
  }

  /**
   * Convenience methods: Emit logs by level
   */
  debug(message: string, context?: LogContext): void {
    this.emit({
      level: 'DEBUG',
      message,
      timestamp: nowISO8601(),
      context
    });
  }

  info(message: string, context?: LogContext): void {
    this.emit({
      level: 'INFO',
      message,
      timestamp: nowISO8601(),
      context
    });
  }

  warn(message: string, context?: LogContext): void {
    this.emit({
      level: 'WARN',
      message,
      timestamp: nowISO8601(),
      context
    });
  }

  error(message: string, context?: LogContext): void {
    this.emit({
      level: 'ERROR',
      message,
      timestamp: nowISO8601(),
      context
    });
  }

  /**
   * Return all logs stored in buffer
   */
  getLogs(): readonly LogEvent[] {
    return [...this.logs];
  }

  /**
   * Clear the log buffer
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Return subscriber count (for testing)
   */
  get subscriberCount(): number {
    // Count only valid WeakRefs
    let count = 0;
    for (const ref of this.subscribers) {
      if (ref.deref()) {
        count++;
      }
    }
    return count;
  }
}

/**
 * Singleton instance (for global logging)
 */
let globalLogEmitter: LogEmitter | null = null;

/**
 * Return the global LogEmitter instance
 */
export function getGlobalLogEmitter(): LogEmitter {
  if (!globalLogEmitter) {
    globalLogEmitter = new LogEmitter();
  }
  return globalLogEmitter;
}

/**
 * Reset the global LogEmitter (for testing)
 */
export function resetGlobalLogEmitter(): void {
  globalLogEmitter = null;
}

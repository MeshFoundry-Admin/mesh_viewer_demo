// Core exports
export * from './adapter';
export * from './types';
export * from './mesh-loader';
export * from './mesh-stats';
export * from './persistence';
export * from './metrics-recorder';
export * from './embind-bridge';
export * from './js-parsers';

// Observability exports (003-mesh-core-adapter)
export * from './log-emitter';
export * from './error-factory';
export * from './metrics-collector';
export * from './file-id';
export * from './format-detector';
export * from './contracts';

// Schema validation exports (T057) - Using Zod
export {
  // Zod Schemas
  LogContextSchema,
  LogEventSchema,
  ErrorContextSchema,
  AdapterErrorSchema,
  AdapterMetricsSchema,
  // Validation functions
  validateLogEvent,
  validateAdapterError,
  validateAdapterMetrics,
  // Assertion functions
  assertValidLogEvent,
  assertValidAdapterError,
  assertValidAdapterMetrics,
  // Types
  type ValidationResult,
  type ValidationError,
  SchemaValidationError
} from './schema-validator';

// WASM Log Bridge exports (T056)
export {
  WasmLogBridge,
  convertWasmLogEvent,
  registerWasmLogCallback,
  type WasmAdapterLogEvent
} from './wasm-log-bridge';

// SharedArrayBuffer Timeout exports (T052)
export {
  SHARED_BUFFER_TIMEOUT_MS,
  createSharedBufferLockMonitor,
  withSharedBufferTimeout,
  atomicsWaitWithTimeout,
  type SharedBufferLockMonitor,
  type SharedBufferLockMonitorOptions,
  type TimeoutWarningCallback
} from './shared-buffer-timeout';

// Slice Mesh exports (004-mesh-cross-section)
export {
  sliceMesh,
  createAxisPlane,
  computeSlicePlane,
  type SlicePlane,
  type SliceMeshResult,
  type SliceMeshData
} from './slice-mesh';

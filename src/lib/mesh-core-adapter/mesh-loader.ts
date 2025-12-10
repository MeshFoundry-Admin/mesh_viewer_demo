import type {
  MeshAsset,
  MeshBuffers,
  MeshCoreCapabilities,
  MeshFormat,
  MeshLoadResult,
  MeshStats,
  AdapterError,
  AdapterMetrics,
  AdapterErrorCode,
  LogEvent,
  ErrorContext
} from './types';
import { MAX_MESH_FILE_BYTES, MAX_TRIANGLE_COUNT } from './types';
import { getBuffersForGeneration } from './embind-bridge';
import {
  parsePlyHeader,
  parseAsciiPly,
  isAsciiStl,
  parseAsciiStl,
  parseObj,
  type JsParseResult
} from './js-parsers';

export interface MeshBufferPointers {
  vertexPtr: number;
  vertexCount: number;
  indexPtr: number;
  indexCount: number;
  normalPtr?: number;
  normalCount?: number;
  generation: number;
}

export interface MeshCoreBridge {
  memory: WebAssembly.Memory;
  parseMesh(data: ArrayBuffer, format: MeshFormat): Promise<MeshBufferPointers>;
  releaseBuffers(generation: number): void;
}

export interface MeshLoaderOptions {
  bridge: MeshCoreBridge;
  capabilities: MeshCoreCapabilities;
  formatHint?: MeshFormat;
  idFactory?: () => string;
  now?: () => number;
  statsCalculator?: (buffers: MeshBuffers) => MeshStats | undefined;
  maxFileBytes?: number;
  maxTriangleCount?: number;
}

const DEFAULT_CAMERA_TARGET: [number, number, number] = [0, 0, 0];

/**
 * Generate ISO 8601 UTC timestamp for the current time
 */
function nowISO8601(): string {
  return new Date().toISOString();
}

/**
 * Generate file ID (UUID v4 preferred, hash as fallback)
 */
function generateFileId(fileName: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: fileName + timestamp hash
  const hash = Math.abs(hashCode(`${fileName}-${Date.now()}-${Math.random()}`));
  return `file-${hash.toString(36)}`;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
}

/**
 * Hybrid Mesh Loader
 * 
 * ASCII formats: Uses JavaScript parsers (leveraging V8 optimization)
 * - ASCII PLY, ASCII STL, OBJ
 * 
 * Binary formats: Uses WASM (efficient byte manipulation)
 * - Binary PLY (LE/BE), Binary STL
 */
export async function loadMeshAsset(
  file: Blob & { name?: string },
  options: MeshLoaderOptions
): Promise<MeshLoadResult> {
  const fileName = file.name ?? 'unnamed.mesh';
  const fileSizeBytes = file.size ?? 0;
  const now = options.now ?? (() => Date.now());
  const guardBytes = options.maxFileBytes ?? MAX_MESH_FILE_BYTES;
  const guardTriangles = options.maxTriangleCount ?? MAX_TRIANGLE_COUNT;
  
  // Initialize observability
  const fileId = generateFileId(fileName);
  const logs: LogEvent[] = [];
  const startTime = now();
  
  const emitLog = (level: LogEvent['level'], message: string, context?: Partial<LogEvent['context']>) => {
    logs.push({
      level,
      message,
      timestamp: nowISO8601(),
      context: { fileId, category: 'adapter', ...context }
    });
  };
  
  const buildMetrics = (partial: Partial<AdapterMetrics>): AdapterMetrics => ({
    fileId,
    parseTimeMs: 0,
    totalTimeMs: now() - startTime,
    vertexCount: 0,
    triangleCount: 0,
    parserMode: 'fast',
    fallbackCount: 0,
    bytesRead: fileSizeBytes,
    ...partial
  });

  emitLog('DEBUG', `Starting mesh load: ${fileName}`, { op: 'load_start' });

  if (fileSizeBytes <= 0) {
    emitLog('ERROR', 'Cannot load empty file.', { code: 'E_EMPTY_FILE' });
    return buildErrorResult('E_EMPTY_FILE', 'Cannot load empty file.', { fileName }, buildMetrics({}), logs);
  }

  if (fileSizeBytes > guardBytes) {
    emitLog('ERROR', 'Asset size exceeds allowed limit.', { code: 'E_FILE_TOO_LARGE' });
    return buildErrorResult('E_FILE_TOO_LARGE', 'Asset size exceeds allowed limit.', { fileName }, buildMetrics({}), logs);
  }

  const format = options.formatHint ?? inferFormat(fileName);
  if (!format) {
    emitLog('ERROR', `Unrecognized file extension: ${fileName}`, { code: 'E_UNSUPPORTED_FORMAT' });
    return buildErrorResult('E_UNSUPPORTED_FORMAT', `Unrecognized file extension: ${fileName}`, { fileName, format: 'unknown' }, buildMetrics({}), logs);
  }

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await readBlobArrayBuffer(file);
  } catch (error) {
    emitLog('ERROR', `Failed to read file: ${(error as Error).message}`, { code: 'E_FILE_READ_FAILED' });
    return buildErrorResult('E_FILE_READ_FAILED', `Failed to read file: ${(error as Error).message}`, { fileName, reason: 'io_error' }, buildMetrics({}), logs);
  }

  // Format detection and parser selection
  const parseStrategy = determineParseStrategy(arrayBuffer, format, fileName);
  
  emitLog('DEBUG', `Parser strategy determined: ${parseStrategy.parser} (${parseStrategy.format})`, { op: 'detect_format' });
  console.log(`🔧 Parse strategy: ${parseStrategy.parser} (${parseStrategy.format})`);

  let buffers: MeshBuffers;
  let actualFormat = parseStrategy.format;
  let triangleCount: number;
  let vertexCount: number;
  const parseStart = now();

  if (parseStrategy.parser === 'js') {
    // Use JavaScript parser (ASCII formats)
    console.time('📄 JS Parser');
    try {
      const jsResult = parseWithJs(arrayBuffer, parseStrategy.format);
      triangleCount = jsResult.faceCount;
      vertexCount = Math.floor(jsResult.vertices.length / 3);
      
      if (triangleCount > guardTriangles) {
        emitLog('ERROR', 'Triangle count exceeds allowed limit.', { code: 'E_TOO_MANY_TRIANGLES' });
        return buildErrorResult('E_TOO_MANY_TRIANGLES', 'Triangle count exceeds allowed limit.', { triangleCount, maxTriangles: guardTriangles }, buildMetrics({ triangleCount, vertexCount }), logs);
      }
      
      buffers = toJsBuffers(jsResult);
    } catch (error) {
      emitLog('ERROR', `JS parsing failed: ${(error as Error).message}`, { code: 'E_PARSE_FAILED' });
      return buildErrorResult('E_PARSE_FAILED', `JS parsing failed: ${(error as Error).message}`, { fileName, reason: 'js_parser_error' }, buildMetrics({}), logs);
    }
    console.timeEnd('📄 JS Parser');
  } else {
    // Use WASM parser (Binary formats)
    console.time('🔩 WASM Parser');
    let pointers: MeshBufferPointers;
    try {
      pointers = await options.bridge.parseMesh(arrayBuffer, actualFormat);
    } catch (error) {
      emitLog('ERROR', `WASM parsing failed: ${(error as Error).message}`, { code: 'E_PARSE_FAILED' });
      return buildErrorResult('E_PARSE_FAILED', `WASM parsing failed: ${(error as Error).message}`, { fileName, reason: 'wasm_parser_error' }, buildMetrics({}), logs);
    }
    console.timeEnd('🔩 WASM Parser');

    buffers = toMeshBuffers(options.bridge, pointers);
    triangleCount = Math.floor(pointers.indexCount / 3);
    vertexCount = pointers.vertexCount;
    
    if (triangleCount > guardTriangles) {
      buffers.release();
      emitLog('ERROR', 'Triangle count exceeds allowed limit.', { code: 'E_TOO_MANY_TRIANGLES' });
      return buildErrorResult('E_TOO_MANY_TRIANGLES', 'Triangle count exceeds allowed limit.', { triangleCount, maxTriangles: guardTriangles }, buildMetrics({ triangleCount, vertexCount }), logs);
    }
  }

  const parseTimeMs = now() - parseStart;
  const loadedAt = now();
  const loadDurationMs = loadedAt - startTime;
  
  const asset: MeshAsset = {
    id: options.idFactory?.() ?? createAssetId(),
    fileName,
    fileSizeBytes,
    format: actualFormat,
    loadedAt,
    loadDurationMs,
    buffers,
    stats: options.statsCalculator?.(buffers)
  };

  const metrics: AdapterMetrics = {
    fileId,
    parseTimeMs,
    totalTimeMs: loadDurationMs,
    vertexCount,
    triangleCount,
    parserMode: 'fast',
    fallbackCount: 0,
    bytesRead: arrayBuffer.byteLength
  };

  emitLog('INFO', `Mesh load complete: ${triangleCount} triangles, ${vertexCount} vertices`, { 
    op: 'load_complete', 
    elapsed_ms: loadDurationMs,
    code: 'Success'
  });

  return {
    status: 'success',
    asset,
    metrics,
    logs
  };
}

interface ParseStrategy {
  parser: 'js' | 'wasm';
  format: MeshFormat;
}

/**
 * Analyzes file content to determine the optimal parser.
 */
function determineParseStrategy(
  data: ArrayBuffer, 
  hintFormat: MeshFormat,
  fileName: string
): ParseStrategy {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  
  if (ext === 'ply') {
    const header = parsePlyHeader(data);
    if (header.format === 'ascii') {
      return { parser: 'js', format: 'ply_ascii' };
    } else if (header.format === 'binary_little_endian') {
      return { parser: 'wasm', format: 'ply_binary_le' };
    } else {
      return { parser: 'wasm', format: 'ply_binary_be' };
    }
  }
  
  if (ext === 'stl') {
    if (isAsciiStl(data)) {
      return { parser: 'js', format: 'stl' };
    } else {
      return { parser: 'wasm', format: 'stl_binary' };
    }
  }
  
  if (ext === 'obj') {
    // OBJ is always ASCII
    return { parser: 'js', format: 'obj' };
  }
  
  // Default: use WASM
  return { parser: 'wasm', format: hintFormat };
}

/**
 * Parses mesh using JavaScript parser.
 */
function parseWithJs(data: ArrayBuffer, format: MeshFormat): JsParseResult {
  switch (format) {
    case 'ply_ascii':
      return parseAsciiPly(data);
    case 'stl':
      return parseAsciiStl(data);
    case 'obj':
      return parseObj(data);
    default:
      throw new Error(`JS parser does not support format: ${format}`);
  }
}

/**
 * Converts JS parsing result to MeshBuffers.
 */
function toJsBuffers(result: JsParseResult): MeshBuffers {
  const released = { value: false };
  
  return {
    vertexView: result.vertices,
    indexView: result.indices,
    normalView: undefined, // JS parser does not compute normals (computed by Three.js)
    generation: -1, // JS parser does not use generation
    release: () => {
      // JS buffers are automatically cleaned up by GC
      released.value = true;
    }
  };
}

function toMeshBuffers(bridge: MeshCoreBridge, pointers: MeshBufferPointers): MeshBuffers {
  const released = { value: false };

  // Get copied buffers from Embind bridge
  const cached = getBuffersForGeneration(pointers.generation);

  let vertexView: Float64Array;
  let indexView: Uint32Array;
  let normalView: Float32Array | undefined;

  if (cached) {
    // Embind mode: use copied buffers
    vertexView = cached.vertices;
    indexView = cached.indices;
    normalView = cached.normals ?? undefined;
  } else {
    // Legacy mode: direct WASM memory reference (for test mocks, etc.)
    const memoryBuffer = bridge.memory.buffer;
    vertexView = new Float64Array(memoryBuffer, pointers.vertexPtr, pointers.vertexCount);
    indexView = new Uint32Array(memoryBuffer, pointers.indexPtr, pointers.indexCount);
    normalView =
      typeof pointers.normalPtr === 'number'
        ? new Float32Array(memoryBuffer, pointers.normalPtr, pointers.normalCount ?? pointers.vertexCount)
        : undefined;
  }

  return {
    vertexView,
    indexView,
    normalView,
    generation: pointers.generation,
    release: () => {
      if (released.value) {
        return;
      }
      released.value = true;
      bridge.releaseBuffers(pointers.generation);
    }
  };
}

function inferFormat(fileName: string): MeshFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.obj')) {
    return 'obj';
  }
  if (lower.endsWith('.stl')) {
    return 'stl';
  }
  if (lower.endsWith('.ply')) {
    // PLY format requires detecting actual format from header
    // Return default here; header analysis needed during actual parsing
    return 'ply_ascii';
  }
  return null;
}

function createAssetId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `asset-${Math.random().toString(36).slice(2)}`;
}

/**
 * Builds error result - complies with new MeshLoadResult schema
 */
function buildErrorResult(
  code: AdapterErrorCode,
  message: string,
  context: ErrorContext | undefined,
  metrics: AdapterMetrics,
  logs: LogEvent[]
): MeshLoadResult {
  const error: AdapterError = {
    code,
    message,
    severity: 'error',
    timestamp: nowISO8601(),
    context
  };
  
  return {
    status: 'error',
    error,
    metrics,
    logs
  };
}

async function readBlobArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  const candidate = blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof candidate.arrayBuffer === 'function') {
    return candidate.arrayBuffer();
  }
  if (typeof Response !== 'undefined') {
    return new Response(blob).arrayBuffer();
  }
  if (typeof FileReader !== 'undefined') {
    return await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (result instanceof ArrayBuffer) {
          resolve(result);
        } else if (result) {
          resolve(new TextEncoder().encode(String(result)).buffer);
        } else {
          reject(new Error('Unable to read file as array buffer.'));
        }
      };
      reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
      reader.readAsArrayBuffer(blob);
    });
  }
  throw new Error('Environment does not support arrayBuffer API.');
}

export function clampCameraTarget(value?: [number, number, number]): [number, number, number] {
  return value ?? DEFAULT_CAMERA_TARGET;
}

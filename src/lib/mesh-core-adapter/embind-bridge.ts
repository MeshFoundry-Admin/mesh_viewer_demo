/**
 * Embind Bridge for MeshToolkitCore WASM Module
 *
 * Loads WASM module built with Emscripten Embind and provides JavaScript API.
 */

import type { MeshCoreBridge, MeshBufferPointers } from './mesh-loader';
import type { MeshCoreCapabilities, MeshFormat } from './types';

export interface EmbindParseResult {
  success: boolean;
  error: string;
  vertexCount: number;
  faceCount: number;
  vertices?: Float64Array;
  indices?: Uint32Array;
  normals?: Float32Array;
}

export interface EmbindCapabilities {
  version: string;
  formats: string[];
  binaryStl: boolean;
  binaryPly: boolean;
}

export interface MeshCoreEmbindModule {
  getVersion(): string;
  getCapabilities(): EmbindCapabilities;
  parseMeshFromPointer(dataPtr: number, dataLen: number, filename: string, computeNormals: boolean): EmbindParseResult;
  HEAPU8: Uint8Array;
  HEAPF64: Float64Array;
  HEAPU32: Uint32Array;
  HEAPF32: Float32Array;
  _malloc(size: number): number;
  _free(ptr: number): void;
}

interface PendingBuffers {
  generation: number;
  vertices: Float64Array;
  indices: Uint32Array;
  normals: Float32Array | null;
}

let moduleInstance: MeshCoreEmbindModule | null = null;
let modulePromise: Promise<MeshCoreEmbindModule> | null = null;
let generationCounter = 0;
const pendingBuffersMap = new Map<number, PendingBuffers>();

/**
 * Loads the Emscripten Embind module.
 */
export async function loadEmbindModule(
  baseUrl = '/core'
): Promise<MeshCoreEmbindModule> {
  if (moduleInstance) {
    return moduleInstance;
  }

  if (modulePromise) {
    return modulePromise;
  }

  modulePromise = (async () => {
    const jsUrl = `${baseUrl.replace(/\/$/, '')}/mesh_core.js`;

    // Load Emscripten ES6 module
    const module = await loadEmscriptenModule(jsUrl, baseUrl);

    moduleInstance = module as MeshCoreEmbindModule;
    return moduleInstance;
  })();

  return modulePromise;
}

/**
 * Loads Emscripten ES Module.
 * Since Vite dev server cannot import JS from public folder,
 * the module is loaded through a blob URL.
 */
async function loadEmscriptenModule(
  jsUrl: string,
  baseUrl: string
): Promise<MeshCoreEmbindModule> {
  // Fetch JS file contents
  const response = await fetch(jsUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch Emscripten module: ${jsUrl} (${response.status})`);
  }
  
  let jsSource = await response.text();
  
  // Patch import.meta.url to actual URL (doesn't work in blob URL)
  const absoluteJsUrl = new URL(jsUrl, window.location.href).href;
  jsSource = jsSource.replace(
    /import\.meta\.url/g,
    JSON.stringify(absoluteJsUrl)
  );
  
  // Use as-is since export default already exists
  const blob = new Blob([jsSource], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  
  try {
    // Import module from blob URL
    const moduleFactory = await import(/* @vite-ignore */ blobUrl);
    const factory = moduleFactory.default || moduleFactory;
    
    // Initialize Emscripten module
    const module = await factory({
      locateFile: (path: string) => {
        if (path.endsWith('.wasm')) {
          return `${baseUrl.replace(/\/$/, '')}/${path}`;
        }
        return path;
      }
    });

    return module as MeshCoreEmbindModule;
  } finally {
    // Cleanup blob URL
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Returns capability of the loaded module.
 */
export function getModuleCapabilities(
  module: MeshCoreEmbindModule
): MeshCoreCapabilities {
  try {
    const caps = module.getCapabilities();
    return {
      binaryPlyEnabled: caps.binaryPly,
      wasmVersion: caps.version
    };
  } catch {
    return {
      binaryPlyEnabled: false,
      wasmVersion: module.getVersion?.() ?? '0.0.0-unknown'
    };
  }
}

/**
 * Creates an Embind bridge implementing the MeshCoreBridge interface.
 */
export function createEmbindBridge(
  module: MeshCoreEmbindModule
): MeshCoreBridge {
  // Dummy memory - not directly used as Embind uses typed_memory_view
  const dummyMemory = new WebAssembly.Memory({ initial: 1 });

  return {
    memory: dummyMemory,

    async parseMesh(
      data: ArrayBuffer,
      format: MeshFormat
    ): Promise<MeshBufferPointers> {
      // Infer file extension from format
      const filenameMap: Record<MeshFormat, string> = {
        stl: 'model.stl',
        stl_binary: 'model.stl',
        obj: 'model.obj',
        ply_ascii: 'model.ply',
        ply_binary_le: 'model.ply',
        ply_binary_be: 'model.ply'
      };
      const filename = filenameMap[format] ?? 'model.stl';

      // Start performance measurement
      const timings: Record<string, number> = {};
      let t0 = performance.now();

      // Copy data directly to WASM heap (fast transfer)
      const uint8 = new Uint8Array(data);
      timings['1_arrayBuffer_to_uint8'] = performance.now() - t0;
      
      t0 = performance.now();
      const dataPtr = module._malloc(uint8.length);
      timings['2_malloc'] = performance.now() - t0;
      
      try {
        t0 = performance.now();
        // Copy at once through HEAPU8
        module.HEAPU8.set(uint8, dataPtr);
        timings['3_heapu8_set'] = performance.now() - t0;
        
        t0 = performance.now();
        const result = module.parseMeshFromPointer(dataPtr, uint8.length, filename, false);
        timings['4_wasm_parse'] = performance.now() - t0;

        if (!result.success) {
          throw new Error(result.error || 'Mesh parsing failed');
        }

        // Copy result data for storage (WASM memory can change dynamically)
        const generation = ++generationCounter;

        t0 = performance.now();
        // Copy data since typed_memory_view cannot be accessed directly
        const vertices = new Float64Array(result.vertices?.length ?? 0);
        if (result.vertices) {
          vertices.set(result.vertices);
        }
        timings['5_copy_vertices'] = performance.now() - t0;

        t0 = performance.now();
        const indices = new Uint32Array(result.indices?.length ?? 0);
        if (result.indices) {
          indices.set(result.indices);
        }
        timings['6_copy_indices'] = performance.now() - t0;

        t0 = performance.now();
        const normals = result.normals
          ? new Float32Array(result.normals.length)
          : null;
        if (normals && result.normals) {
          normals.set(result.normals);
        }
        timings['7_copy_normals'] = performance.now() - t0;

        // Output measurement results
        console.group('🔬 Mesh Parse Timings');
        console.log(`File size: ${(uint8.length / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Vertices: ${vertices.length / 3} | Indices: ${indices.length} | Normals: ${normals?.length ?? 0}`);
        let total = 0;
        for (const [key, ms] of Object.entries(timings)) {
          console.log(`  ${key}: ${ms.toFixed(2)} ms`);
          total += ms;
        }
        console.log(`  TOTAL: ${total.toFixed(2)} ms`);
        console.groupEnd();

        pendingBuffersMap.set(generation, {
          generation,
          vertices,
          indices,
          normals
        });

        return {
          vertexPtr: 0, // Flag, not actual pointer
          vertexCount: vertices.length,
          indexPtr: 0,
          indexCount: indices.length,
          normalPtr: normals ? 0 : undefined,
          normalCount: normals?.length,
          generation
        };
      } finally {
        // Release WASM heap memory
        module._free(dataPtr);
      }
    },

    releaseBuffers(generation: number): void {
      pendingBuffersMap.delete(generation);
    }
  };
}

/**
 * Gets buffer data for the specified generation.
 */
export function getBuffersForGeneration(generation: number): PendingBuffers | undefined {
  return pendingBuffersMap.get(generation);
}

/**
 * Returns initialized bridge with capability.
 */
export interface EmbindBootstrapResult {
  bridge: MeshCoreBridge;
  capabilities: MeshCoreCapabilities;
  module: MeshCoreEmbindModule;
}

export async function bootstrapEmbindBridge(
  baseUrl = '/core'
): Promise<EmbindBootstrapResult> {
  const module = await loadEmbindModule(baseUrl);
  const bridge = createEmbindBridge(module);
  const capabilities = getModuleCapabilities(module);

  return { bridge, capabilities, module };
}

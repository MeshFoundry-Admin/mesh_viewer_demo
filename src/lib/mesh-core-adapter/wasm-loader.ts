import type { MeshCoreCapabilities } from './types';

export interface WasmLoaderOptions {
  baseUrl?: string;
  wasmFileName?: string;
  importObject?: WebAssembly.Imports;
}

export interface MeshCoreModule {
  instance: WebAssembly.Instance;
  module: WebAssembly.Module;
  memory: WebAssembly.Memory;
}

export interface MeshCoreBootstrap {
  module: MeshCoreModule;
  capabilities: MeshCoreCapabilities;
}

export async function loadMeshCoreModule(
  options: WasmLoaderOptions = {}
): Promise<MeshCoreBootstrap> {
  const baseUrl = options.baseUrl ?? '/core';
  const wasmFileName = options.wasmFileName ?? 'mesh_core.wasm';
  const wasmUrl = resolveUrl(baseUrl, wasmFileName);
  const importObject = options.importObject ?? {};

  const instantiated = await instantiateWithFallback(wasmUrl, importObject);
  const memory = pickMemory(instantiated.instance.exports);

  return {
    module: {
      instance: instantiated.instance,
      module: instantiated.module,
      memory
    },
    capabilities: detectCapabilities(instantiated.instance.exports)
  };
}

async function instantiateWithFallback(
  wasmUrl: string,
  importObject: WebAssembly.Imports
): Promise<WebAssembly.WebAssemblyInstantiatedSource> {
  if (typeof WebAssembly === 'undefined') {
    throw new Error('WebAssembly is not supported in this runtime.');
  }
  const response = await fetch(wasmUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to fetch WASM asset: ${wasmUrl} (${response.status})`);
  }

  const supportsStreaming = typeof WebAssembly.instantiateStreaming === 'function';
  const contentType = response.headers.get('Content-Type') ?? '';

  if (supportsStreaming && contentType.includes('application/wasm')) {
    try {
      return await WebAssembly.instantiateStreaming(response, importObject);
    } catch (error) {
      console.warn('[mesh-core-adapter] Streaming instantiate failed, falling back to ArrayBuffer', error);
    }
  }

  const buffer = await response.arrayBuffer();
  return await WebAssembly.instantiate(buffer, importObject);
}

function pickMemory(exports: WebAssembly.Exports): WebAssembly.Memory {
  const memory = Object.values(exports).find((value): value is WebAssembly.Memory => value instanceof WebAssembly.Memory);
  if (!memory) {
    throw new Error('Mesh Core module did not expose a WebAssembly.Memory export.');
  }
  return memory;
}

function detectCapabilities(exports: WebAssembly.Exports): MeshCoreCapabilities {
  const binaryFlag = Boolean((exports as Record<string, unknown>).MT_ENABLE_PLY_BINARY ?? 0);
  const versionExport = (exports as Record<string, unknown>).MT_CORE_VERSION;
  const wasmVersion = typeof versionExport === 'string' ? versionExport : '0.0.0-dev';
  return {
    binaryPlyEnabled: binaryFlag,
    wasmVersion
  };
}

function resolveUrl(baseUrl: string, fileName: string): string {
  if (fileName.startsWith('http')) {
    return fileName;
  }
  return `${baseUrl.replace(/\/$/, '')}/${fileName.replace(/^\//, '')}`;
}

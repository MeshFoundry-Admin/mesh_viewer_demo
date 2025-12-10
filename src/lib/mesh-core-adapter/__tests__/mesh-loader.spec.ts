import { describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { loadMeshAsset, MeshCoreBridge, MeshBufferPointers } from '../mesh-loader';
import { parsePlyHeader } from '../js-parsers';
import type { MeshCoreCapabilities, MeshFormat } from '../types';

type BridgeMock = MeshCoreBridge & {
  parseMesh: MockInstance<[ArrayBuffer, MeshFormat], Promise<MeshBufferPointers>>;
  releaseBuffers: MockInstance<[number], void>;
};

const baseCapabilities: MeshCoreCapabilities = {
  binaryPlyEnabled: true,  // Binary PLY is now supported by default
  wasmVersion: 'test'
};

describe('loadMeshAsset', () => {
  it('rejects files exceeding byte guard', async () => {
    const bridge = createBridge();
    const file = new File([new Uint8Array(16)], 'big.obj', { type: 'text/plain' });

    const result = await loadMeshAsset(file, {
      bridge,
      capabilities: baseCapabilities,
      maxFileBytes: 8
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('UnsupportedAsset.too_large');
    }
    expect(bridge.parseMesh).not.toHaveBeenCalled();
  });

  it('loads binary PLY files with auto-format detection', async () => {
    const bridge = createBridge();
    // Binary Little Endian PLY header
    const header = `ply\nformat binary_little_endian 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n`;
    const headerBytes = new TextEncoder().encode(header);
    
    // Using mock because File.arrayBuffer() is not supported in jsdom
    const arrayBuffer = headerBytes.buffer.slice(
      headerBytes.byteOffset,
      headerBytes.byteOffset + headerBytes.byteLength
    );
    
    // Direct test of parsePlyHeader
    const parsedHeader = parsePlyHeader(arrayBuffer);
    expect(parsedHeader.format).toBe('binary_little_endian');
    
    // Create Mock File object (including arrayBuffer method)
    const mockFile = {
      name: 'sample.ply',
      size: headerBytes.length,
      type: 'application/octet-stream',
      arrayBuffer: async () => arrayBuffer
    } as unknown as File;

    const result = await loadMeshAsset(mockFile, {
      bridge,
      capabilities: baseCapabilities
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // format must be ply_binary_le
      expect(result.asset.format).toBe('ply_binary_le');
      result.asset.buffers.release();
    }
  });

  it('returns zero-copy typed arrays and release hook for OBJ (JS parser)', async () => {
    const bridge = createBridge();
    // Valid OBJ file content (1 triangle)
    const objContent = `v 0.5 0.5 0.0
v 1.0 1.0 1.0
v 0.0 1.0 0.5
f 1 2 3
`;
    const objBytes = new TextEncoder().encode(objContent);
    const mockFile = {
      name: 'model.obj',
      size: objBytes.length,
      type: 'text/plain',
      arrayBuffer: async () => objBytes.buffer.slice(objBytes.byteOffset, objBytes.byteOffset + objBytes.byteLength)
    } as unknown as File;
    const timestamps = [1000, 1250];

    const result = await loadMeshAsset(mockFile, {
      bridge,
      capabilities: baseCapabilities,
      formatHint: 'obj',
      now: () => timestamps.shift() ?? Date.now()
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Verify first vertex since JS parser processed the OBJ
      expect(result.asset.buffers.vertexView[0]).toBeCloseTo(0.5);
      expect(result.asset.buffers.indexView[0]).toBe(0);
      expect(result.telemetry.loadDurationMs).toBe(250);
      // JS parser does not call bridge.releaseBuffers
      result.asset.buffers.release();
    }
  });

  it('uses JS parser for ASCII STL files', async () => {
    const bridge = createBridge();
    // Valid ASCII STL file content
    const stlContent = `solid test
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 1 0 0
    vertex 0.5 1 0
  endloop
endfacet
endsolid test
`;
    const stlBytes = new TextEncoder().encode(stlContent);
    const mockFile = {
      name: 'legacy.stl',
      size: stlBytes.length,
      type: 'application/octet-stream',
      arrayBuffer: async () => stlBytes.buffer.slice(stlBytes.byteOffset, stlBytes.byteOffset + stlBytes.byteLength)
    } as unknown as File;

    const result = await loadMeshAsset(mockFile, {
      bridge,
      capabilities: baseCapabilities
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.asset.fileName).toBe('legacy.stl');
      expect(result.asset.format).toBe('stl');
      expect(result.asset.buffers.vertexView.length).toBe(9); // 3 vertices * 3 coords
      result.asset.buffers.release();
      // JS parser does not call bridge.releaseBuffers
    }
  });
});

describe('parsePlyHeader', () => {
  it('detects ASCII PLY format', () => {
    const header = `ply\nformat ascii 1.0\nelement vertex 3\nend_header\n`;
    const buffer = new TextEncoder().encode(header).buffer;
    expect(parsePlyHeader(buffer).format).toBe('ascii');
  });

  it('detects binary little endian PLY format', () => {
    const header = `ply\nformat binary_little_endian 1.0\nelement vertex 3\nend_header\n`;
    const buffer = new TextEncoder().encode(header).buffer;
    expect(parsePlyHeader(buffer).format).toBe('binary_little_endian');
  });

  it('detects binary big endian PLY format', () => {
    const header = `ply\nformat binary_big_endian 1.0\nelement vertex 3\nend_header\n`;
    const buffer = new TextEncoder().encode(header).buffer;
    expect(parsePlyHeader(buffer).format).toBe('binary_big_endian');
  });

  it('defaults to ASCII for unknown format', () => {
    const header = `ply\nelement vertex 3\nend_header\n`;
    const buffer = new TextEncoder().encode(header).buffer;
    expect(parsePlyHeader(buffer).format).toBe('ascii');
  });

  it('handles Windows line endings (CRLF)', () => {
    const header = `ply\r\nformat binary_little_endian 1.0\r\nelement vertex 3\r\nend_header\r\n`;
    const buffer = new TextEncoder().encode(header).buffer;
    expect(parsePlyHeader(buffer).format).toBe('binary_little_endian');
  });
});

function createBridge(): BridgeMock {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const vertexPtr = 0;
  const vertexCount = 6;
  const vertexView = new Float64Array(memory.buffer, vertexPtr, vertexCount);
  vertexView.set([0.5, 0.5, 0.0, 1.0, 1.0, 1.0]);

  const indexPtr = vertexPtr + vertexCount * Float64Array.BYTES_PER_ELEMENT;
  const indexView = new Uint32Array(memory.buffer, indexPtr, 6);
  indexView.set([0, 1, 2, 2, 3, 0]);

  const pointers: MeshBufferPointers = {
    vertexPtr,
    vertexCount,
    indexPtr,
    indexCount: indexView.length,
    generation: 1
  };

  const parseMesh = vi.fn<[ArrayBuffer, MeshFormat], Promise<MeshBufferPointers>>(async () => pointers);
  const releaseBuffers = vi.fn<[number], void>(() => undefined);

  const bridge: MeshCoreBridge = {
    memory,
    parseMesh: (async (...args) => parseMesh(...args)) as MeshCoreBridge['parseMesh'],
    releaseBuffers: ((generation: number) => releaseBuffers(generation)) as MeshCoreBridge['releaseBuffers']
  };

  return Object.assign(bridge, { parseMesh, releaseBuffers }) as BridgeMock;
}

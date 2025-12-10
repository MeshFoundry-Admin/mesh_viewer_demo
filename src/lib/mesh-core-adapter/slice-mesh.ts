/**
 * @file slice-mesh.ts
 * @description sliceMesh TypeScript wrapper for WASM C++ function
 * 
 * Wraps the WASM sliceMeshFromPointer function to provide an easy-to-use API in TypeScript.
 */

import type { ClippingAxis } from './types';

/** Mesh data interface */
export interface SliceMeshData {
  vertices: Float64Array | number[];
  indices: Uint32Array | number[];
  vertexCount?: number;
  faceCount?: number;
}

/** Plane definition */
export interface SlicePlane {
  /** Normal vector (normalized) */
  normal: { x: number; y: number; z: number };
  /** Signed distance from origin to plane */
  distance: number;
}

/** Slice result */
export interface SliceMeshResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message (on failure) */
  error?: string;
  /** Result mesh data (on success) */
  mesh?: SliceMeshData;
  /** Number of exact fallback uses */
  exactFallbackCount: number;
  /** Exact fallback ratio (0-1) */
  exactFallbackRatio: number;
}

/** WASM module interface (sliceMesh related) */
interface SliceMeshModule {
  sliceMeshFromPointer(
    verticesPtr: number,
    verticesLen: number,
    indicesPtr: number,
    indicesLen: number,
    normalX: number,
    normalY: number,
    normalZ: number,
    distance: number
  ): {
    success: boolean;
    error: string;
    vertices?: Float64Array;
    indices?: Uint32Array;
    vertexCount: number;
    faceCount: number;
    exactFallbackCount: number;
    exactFallbackRatio: number;
  };
  HEAPU8: Uint8Array;
  HEAPF64: Float64Array;
  HEAPU32: Uint32Array;
  _malloc(size: number): number;
  _free(ptr: number): void;
}

/**
 * Create a plane from axis and position
 */
export function createAxisPlane(axis: ClippingAxis, position: number, flip: boolean = false): SlicePlane {
  const normals: Record<ClippingAxis, { x: number; y: number; z: number }> = {
    x: { x: 1, y: 0, z: 0 },
    y: { x: 0, y: 1, z: 0 },
    z: { x: 0, y: 0, z: 1 }
  };
  
  const normal = normals[axis];
  
  // Invert normal if flip is true
  if (flip) {
    normal.x = -normal.x;
    normal.y = -normal.y;
    normal.z = -normal.z;
  }
  
  return {
    normal,
    distance: position
  };
}

/**
 * Slices a mesh with a plane.
 * 
 * @param module WASM module instance
 * @param mesh Input mesh data
 * @param plane Slice plane
 * @returns Slice result
 */
export async function sliceMesh(
  module: SliceMeshModule,
  mesh: SliceMeshData,
  plane: SlicePlane
): Promise<SliceMeshResult> {
  // Input validation
  if (!mesh.vertices || mesh.vertices.length === 0) {
    return {
      success: false,
      error: 'Slice.EmptyInput: No vertices provided',
      exactFallbackCount: 0,
      exactFallbackRatio: 0
    };
  }
  
  if (!mesh.indices || mesh.indices.length === 0) {
    return {
      success: false,
      error: 'Slice.EmptyInput: No indices provided',
      exactFallbackCount: 0,
      exactFallbackRatio: 0
    };
  }
  
  // Convert to Float64Array (if necessary)
  const vertices = mesh.vertices instanceof Float64Array 
    ? mesh.vertices 
    : new Float64Array(mesh.vertices);
    
  const indices = mesh.indices instanceof Uint32Array
    ? mesh.indices
    : new Uint32Array(mesh.indices);
  
  // Copy data to WASM heap
  const verticesBytes = vertices.byteLength;
  const indicesBytes = indices.byteLength;
  
  const verticesPtr = module._malloc(verticesBytes);
  const indicesPtr = module._malloc(indicesBytes);
  
  try {
    // Copy vertex data (Float64Array)
    const verticesOffset = verticesPtr / 8;  // Float64 = 8 bytes
    module.HEAPF64.set(vertices, verticesOffset);
    
    // Copy index data (Uint32Array)
    const indicesOffset = indicesPtr / 4;  // Uint32 = 4 bytes
    module.HEAPU32.set(indices, indicesOffset);
    
    // Call WASM function
    const result = module.sliceMeshFromPointer(
      verticesPtr,
      verticesBytes,
      indicesPtr,
      indicesBytes,
      plane.normal.x,
      plane.normal.y,
      plane.normal.z,
      plane.distance
    );
    
    if (!result.success) {
      return {
        success: false,
        error: result.error,
        exactFallbackCount: result.exactFallbackCount,
        exactFallbackRatio: result.exactFallbackRatio
      };
    }
    
    // If result is empty (all faces were clipped)
    if (result.faceCount === 0) {
      return {
        success: false,
        error: 'Slice.EmptyResult: All faces were clipped',
        exactFallbackCount: result.exactFallbackCount,
        exactFallbackRatio: result.exactFallbackRatio
      };
    }
    
    // Construct result mesh
    const resultMesh: SliceMeshData = {
      vertices: result.vertices ? new Float64Array(result.vertices) : new Float64Array(0),
      indices: result.indices ? new Uint32Array(result.indices) : new Uint32Array(0),
      vertexCount: result.vertexCount,
      faceCount: result.faceCount
    };
    
    return {
      success: true,
      mesh: resultMesh,
      exactFallbackCount: result.exactFallbackCount,
      exactFallbackRatio: result.exactFallbackRatio
    };
    
  } finally {
    // Free memory
    module._free(verticesPtr);
    module._free(indicesPtr);
  }
}

/**
 * Compute slice plane from bounding box and clipping state
 */
export function computeSlicePlane(
  axis: ClippingAxis,
  position: number,  // 0-1 range
  flip: boolean,
  bbox: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
): SlicePlane {
  // Calculate range based on axis
  const axisRanges: Record<ClippingAxis, { min: number; max: number }> = {
    x: { min: bbox.min.x, max: bbox.max.x },
    y: { min: bbox.min.y, max: bbox.max.y },
    z: { min: bbox.min.z, max: bbox.max.z }
  };
  
  const range = axisRanges[axis];
  const distance = range.min + (range.max - range.min) * position;
  
  return createAxisPlane(axis, distance, flip);
}

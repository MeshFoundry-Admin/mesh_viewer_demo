import { describe, expect, it } from 'vitest';
import { computeMeshStats, formatMeshStats } from '../mesh-stats';
import type { MeshBuffers, MeshStats } from '../types';

/**
 * Creates a simple MeshBuffers for testing.
 * Returns a mock buffer based on vertex coordinates and indices.
 */
function createMockBuffers(
  vertices: number[][],
  indices: number[]
): MeshBuffers {
  const vertexView = new Float64Array(vertices.flat());
  const indexView = new Uint32Array(indices);

  return {
    vertexView,
    indexView,
    generation: 1,
    release: () => {}
  };
}

describe('computeMeshStats', () => {
  it('accurately calculates vertex/triangle count for a single triangle', () => {
    // Single triangle: 3 vertices, 1 triangle
    const buffers = createMockBuffers(
      [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0]
      ],
      [0, 1, 2]
    );

    const stats = computeMeshStats(buffers);

    expect(stats.vertices).toBe(3);
    expect(stats.triangles).toBe(1);
  });

  it('accurately calculates bbox min/max', () => {
    const buffers = createMockBuffers(
      [
        [-1, -2, -3],
        [4, 5, 6],
        [0, 0, 0]
      ],
      [0, 1, 2]
    );

    const stats = computeMeshStats(buffers);

    expect(stats.bbox.min).toEqual([-1, -2, -3]);
    expect(stats.bbox.max).toEqual([4, 5, 6]);
  });

  it('accurately calculates diagonal length', () => {
    // Unit cube: min=(0,0,0), max=(1,1,1)
    // diagonal = sqrt(1^2 + 1^2 + 1^2) = sqrt(3) ≈ 1.732
    const buffers = createMockBuffers(
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
        [0, 0, 1],
        [1, 0, 1],
        [1, 1, 1],
        [0, 1, 1]
      ],
      [0, 1, 2, 2, 3, 0, 4, 5, 6, 6, 7, 4]
    );

    const stats = computeMeshStats(buffers);

    expect(stats.diagonalLength).toBeCloseTo(Math.sqrt(3), 5);
  });

  it('correctly handles empty mesh', () => {
    const buffers = createMockBuffers([], []);

    const stats = computeMeshStats(buffers);

    expect(stats.vertices).toBe(0);
    expect(stats.triangles).toBe(0);
    expect(stats.bbox.min).toEqual([0, 0, 0]);
    expect(stats.bbox.max).toEqual([0, 0, 0]);
    expect(stats.diagonalLength).toBe(0);
  });

  it('completes within 500ms for large mesh (performance test)', () => {
    // 10,000 vertices, 10,000 triangles
    const vertexCount = 10000;
    const vertices: number[][] = [];
    for (let i = 0; i < vertexCount; i++) {
      vertices.push([Math.random() * 100, Math.random() * 100, Math.random() * 100]);
    }

    const indices: number[] = [];
    for (let i = 0; i < vertexCount - 2; i++) {
      indices.push(i, i + 1, i + 2);
    }

    const buffers = createMockBuffers(vertices, indices);

    const start = performance.now();
    const stats = computeMeshStats(buffers);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(stats.vertices).toBe(vertexCount);
    expect(stats.triangles).toBe(Math.floor(indices.length / 3));
  });
});

describe('formatMeshStats', () => {
  it('formats statistics in human-readable format', () => {
    const stats: MeshStats = {
      vertices: 1234567,
      triangles: 654321,
      bbox: {
        min: [-1.5, -2.5, -3.5],
        max: [4.567, 5.678, 6.789]
      },
      diagonalLength: 12.3456789
    };

    const formatted = formatMeshStats(stats);

    expect(formatted.vertices).toBe('1,234,567');
    expect(formatted.triangles).toBe('654,321');
    expect(formatted.bboxMin).toBe('(-1.500, -2.500, -3.500)');
    expect(formatted.bboxMax).toBe('(4.567, 5.678, 6.789)');
    expect(formatted.diagonal).toBe('12.346');
  });
});

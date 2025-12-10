import type { MeshBuffers, MeshStats } from './types';

/**
 * Computes statistics (vertex count, triangle count, bbox, diagonal) from mesh buffers.
 * Optimized to complete within 500ms.
 * 
 * @param buffers - Mesh buffers (vertexView, indexView)
 * @returns MeshStats object
 */
export function computeMeshStats(buffers: MeshBuffers): MeshStats {
  const { vertexView, indexView } = buffers;

  const vertexCount = Math.floor(vertexView.length / 3);
  const triangleCount = Math.floor(indexView.length / 3);

  // Initialize bbox - start with extreme values
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  // Iterate through vertices to compute bbox
  const len = vertexView.length;
  for (let i = 0; i < len; i += 3) {
    const x = vertexView[i];
    const y = vertexView[i + 1];
    const z = vertexView[i + 2];

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  // Handle empty mesh
  if (vertexCount === 0) {
    minX = minY = minZ = 0;
    maxX = maxY = maxZ = 0;
  }

  // Calculate diagonal length
  const dx = maxX - minX;
  const dy = maxY - minY;
  const dz = maxZ - minZ;
  const diagonalLength = Math.sqrt(dx * dx + dy * dy + dz * dz);

  return {
    vertices: vertexCount,
    triangles: triangleCount,
    bbox: {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    },
    diagonalLength,
  };
}

/**
 * Formats mesh statistics computation results into display strings.
 * 
 * @param stats - MeshStats object
 * @returns Formatted string object
 */
export function formatMeshStats(stats: MeshStats): {
  vertices: string;
  triangles: string;
  bboxMin: string;
  bboxMax: string;
  diagonal: string;
} {
  const formatNumber = (n: number): string => n.toLocaleString();
  const formatCoord = (coords: [number, number, number]): string =>
    `(${coords.map((c) => c.toFixed(3)).join(', ')})`;

  return {
    vertices: formatNumber(stats.vertices),
    triangles: formatNumber(stats.triangles),
    bboxMin: formatCoord(stats.bbox.min),
    bboxMax: formatCoord(stats.bbox.max),
    diagonal: stats.diagonalLength.toFixed(3),
  };
}

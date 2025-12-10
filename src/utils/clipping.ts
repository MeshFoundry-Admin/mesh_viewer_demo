/**
 * Clipping utility functions
 * 
 * Common utilities for Three.js GPU clipping and C++ sliceMesh algorithm.
 * 
 * @module utils/clipping
 */

import * as THREE from 'three';
import type { ClippingState, ClippingAxis } from '@/lib/mesh-core-adapter';

/**
 * Bounding box interface
 * 
 * Compatible with Three.js Box3 structure.
 */
export interface BoundingBox {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/**
 * Create Three.js Plane from clipping state and bounding box
 * 
 * Converts slider position (0~100%) to actual coordinates,
 * and creates a plane with the appropriate normal vector for the axis.
 * 
 * @param clipping - Clipping state
 * @param bbox - Mesh bounding box
 * @returns Three.js Plane object
 * 
 * @example
 * ```typescript
 * const plane = computeClippingPlane(clipping, {
 *   min: { x: -10, y: -10, z: -10 },
 *   max: { x: 10, y: 10, z: 10 }
 * });
 * mesh.material.clippingPlanes = [plane];
 * ```
 */
export function computeClippingPlane(
  clipping: ClippingState,
  bbox: BoundingBox
): THREE.Plane {
  const t = clipping.position / 100;
  const axis: ClippingAxis = clipping.axis;
  
  // Calculate plane position per axis
  const axisMin = getAxisValue(bbox.min, axis);
  const axisMax = getAxisValue(bbox.max, axis);
  const planePos = axisMin + t * (axisMax - axisMin);
  
  // Normal vector (axis direction)
  const normal = new THREE.Vector3(
    axis === 'x' ? 1 : 0,
    axis === 'y' ? 1 : 0,
    axis === 'z' ? 1 : 0
  );
  
  // Direction flip
  if (clipping.flipped) {
    normal.negate();
  }
  
  // Three.js Plane: constant = -dot(normal, point)
  // Set plane to intersect axis perpendicularly at planePos
  const constant = clipping.flipped ? planePos : -planePos;
  
  return new THREE.Plane(normal, constant);
}

/**
 * Helper function to safely get axis value
 */
function getAxisValue(point: { x: number; y: number; z: number }, axis: ClippingAxis): number {
  switch (axis) {
    case 'x': return point.x;
    case 'y': return point.y;
    case 'z': return point.z;
  }
}

/**
 * Calculate clipping plane helper size from bounding box
 * 
 * Helper plane is set to 120% of bounding box diagonal.
 * 
 * @param bbox - Mesh bounding box
 * @returns Helper plane size
 */
export function computeHelperSize(bbox: BoundingBox): number {
  const dx = bbox.max.x - bbox.min.x;
  const dy = bbox.max.y - bbox.min.y;
  const dz = bbox.max.z - bbox.min.z;
  const diagonal = Math.sqrt(dx * dx + dy * dy + dz * dz);
  
  return diagonal * 1.2;
}

/**
 * Calculate plane position (world coordinates) from clipping state
 * 
 * @param clipping - Clipping state
 * @param bbox - Mesh bounding box
 * @returns Plane position coordinates
 */
export function computePlanePosition(
  clipping: ClippingState,
  bbox: BoundingBox
): THREE.Vector3 {
  const t = clipping.position / 100;
  const axis: ClippingAxis = clipping.axis;
  
  const axisMin = getAxisValue(bbox.min, axis);
  const axisMax = getAxisValue(bbox.max, axis);
  const planePos = axisMin + t * (axisMax - axisMin);
  
  // Bounding box center
  const center = new THREE.Vector3(
    (bbox.min.x + bbox.max.x) / 2,
    (bbox.min.y + bbox.max.y) / 2,
    (bbox.min.z + bbox.max.z) / 2
  );
  
  // Set position per axis
  if (axis === 'x') center.x = planePos;
  else if (axis === 'y') center.y = planePos;
  else center.z = planePos;
  
  return center;
}

/**
 * Calculate plane rotation (Euler) based on axis
 * 
 * @param axis - Clipping axis
 * @returns Euler rotation angles
 */
export function computePlaneRotation(axis: ClippingAxis): THREE.Euler {
  switch (axis) {
    case 'x':
      return new THREE.Euler(0, Math.PI / 2, 0);
    case 'y':
      return new THREE.Euler(Math.PI / 2, 0, 0);
    case 'z':
      return new THREE.Euler(0, 0, 0);
  }
}

/* ============================================
 * Quaternion Utility Functions (005-arbitrary-plane-clipping)
 * ============================================ */

/** Default plane normal (PlaneGeometry default: Z+) */
const DEFAULT_NORMAL = new THREE.Vector3(0, 0, 1);

/**
 * Convert quaternion to plane normal vector
 * 
 * @param quaternion - Rotation quaternion [x, y, z, w]
 * @returns Normal vector (normalized)
 * 
 * @example
 * ```typescript
 * const normal = quaternionToNormal([0, 0, 0, 1]);
 * // => Vector3(0, 0, 1) - Default Z+ direction
 * ```
 */
export function quaternionToNormal(
  quaternion: [number, number, number, number]
): THREE.Vector3 {
  const quat = new THREE.Quaternion(...quaternion);
  return DEFAULT_NORMAL.clone().applyQuaternion(quat).normalize();
}

/**
 * Convert axis to quaternion
 * 
 * @param axis - Clipping axis
 * @returns Quaternion representing the axis direction [x, y, z, w]
 * 
 * @example
 * ```typescript
 * const quat = axisToQuaternion('z');
 * // => [0, 0, 0, 1] - Unit quaternion (Z+ direction)
 * ```
 */
export function axisToQuaternion(
  axis: ClippingAxis
): [number, number, number, number] {
  const quat = new THREE.Quaternion();
  
  switch (axis) {
    case 'x':
      // X-axis normal: 90 degree rotation around Y-axis
      quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
      break;
    case 'y':
      // Y-axis normal: -90 degree rotation around X-axis
      quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
      break;
    case 'z':
      // Z-axis normal: Default direction (unit quaternion)
      quat.identity();
      break;
  }
  
  return [quat.x, quat.y, quat.z, quat.w];
}

/**
 * Convert quaternion to Euler angles (degrees)
 * 
 * @param quaternion - Rotation quaternion [x, y, z, w]
 * @returns Euler angles (in degrees) { x, y, z }
 * 
 * @example
 * ```typescript
 * const degrees = quaternionToEulerDegrees([0.383, 0, 0, 0.924]);
 * // => { x: 45, y: 0, z: 0 }
 * ```
 */
export function quaternionToEulerDegrees(
  quaternion: [number, number, number, number]
): { x: number; y: number; z: number } {
  const quat = new THREE.Quaternion(...quaternion);
  const euler = new THREE.Euler().setFromQuaternion(quat, 'XYZ');
  
  const RAD_TO_DEG = 180 / Math.PI;
  
  return {
    x: Math.round(euler.x * RAD_TO_DEG * 10) / 10,  // 1 decimal place
    y: Math.round(euler.y * RAD_TO_DEG * 10) / 10,
    z: Math.round(euler.z * RAD_TO_DEG * 10) / 10,
  };
}

/**
 * Extended clipping plane calculation (mode-aware)
 * 
 * Calculates axis-aligned or free plane based on mode
 * 
 * @param clipping - Clipping state
 * @param bbox - Mesh bounding box
 * @returns Three.js Plane object
 * 
 * @example
 * ```typescript
 * const plane = computeClippingPlaneExtended(clipping, bbox);
 * mesh.material.clippingPlanes = [plane];
 * ```
 */
export function computeClippingPlaneExtended(
  clipping: ClippingState,
  bbox: BoundingBox
): THREE.Plane {
  // Free plane mode: quaternion-based normal calculation
  if (clipping.mode === 'free') {
    const normal = quaternionToNormal(clipping.quaternion);
    
    // Plane position: bounding box center + normal direction offset
    const center = new THREE.Vector3(
      (bbox.min.x + bbox.max.x) / 2,
      (bbox.min.y + bbox.max.y) / 2,
      (bbox.min.z + bbox.max.z) / 2
    );
    
    // Calculate range in normal direction
    const diagonal = new THREE.Vector3(
      bbox.max.x - bbox.min.x,
      bbox.max.y - bbox.min.y,
      bbox.max.z - bbox.min.z
    ).length();
    
    const t = (clipping.position / 100) - 0.5;  // -0.5 ~ 0.5
    const offset = t * diagonal;
    
    const pointOnPlane = center.clone().addScaledVector(normal, offset);
    
    // Direction flip
    const finalNormal = clipping.flipped ? normal.clone().negate() : normal;
    const constant = -finalNormal.dot(pointOnPlane);
    
    return new THREE.Plane(finalNormal, constant);
  }
  
  // Axis-aligned mode: existing logic
  return computeClippingPlane(clipping, bbox);
}

/**
 * Calculate gizmo size
 * 
 * Per spec: 30% of bounding box diagonal, minimum 1.0
 * 
 * @param bbox - Mesh bounding box
 * @returns Gizmo size
 * 
 * @example
 * ```typescript
 * const gizmoSize = computeGizmoSize(bbox);
 * // bbox diagonal = 10 → gizmoSize = 3.0
 * // bbox diagonal = 2 → gizmoSize = 1.0 (minimum)
 * ```
 */
export function computeGizmoSize(bbox: BoundingBox): number {
  const dx = bbox.max.x - bbox.min.x;
  const dy = bbox.max.y - bbox.min.y;
  const dz = bbox.max.z - bbox.min.z;
  const diagonal = Math.sqrt(dx * dx + dy * dy + dz * dz);
  
  // 30% of diagonal, minimum 1.0
  return Math.max(1.0, diagonal * 0.3);
}

/**
 * Camera range calculation result
 */
export interface CameraRange {
  /** OrbitControls minDistance */
  minDistance: number;
  /** OrbitControls maxDistance */
  maxDistance: number;
  /** Camera far plane */
  far: number;
  /** Camera near plane */
  near: number;
}

/**
 * Calculate camera range based on mesh bounding box
 * 
 * Dynamically calculates camera zoom range and frustum
 * to view meshes of all sizes in full screen.
 * 
 * @param bbox - Mesh bounding box
 * @returns Camera range settings
 * 
 * @example
 * ```typescript
 * const range = computeCameraRange(bbox);
 * // bbox diagonal = 100 → { minDistance: 1, maxDistance: 500, far: 1000, near: 0.1 }
 * // bbox diagonal = 2000 → { minDistance: 20, maxDistance: 10000, far: 20000, near: 2 }
 * ```
 */
export function computeCameraRange(bbox: BoundingBox): CameraRange {
  const dx = bbox.max.x - bbox.min.x;
  const dy = bbox.max.y - bbox.min.y;
  const dz = bbox.max.z - bbox.min.z;
  const diagonal = Math.sqrt(dx * dx + dy * dy + dz * dz);
  
  // Default values (for empty mesh or zero size)
  if (diagonal <= 0 || !isFinite(diagonal)) {
    return {
      minDistance: 0.1,
      maxDistance: 1000,
      far: 10000,
      near: 0.1
    };
  }
  
  // Formula per spec:
  // maxDistance = diagonal × 5 (distance to view entire mesh)
  // far = diagonal × 10 (prevent clipping)
  // minDistance = diagonal × 0.01 (close view distance)
  // near = diagonal × 0.001 (prevent near clipping, minimum 0.01)
  return {
    minDistance: Math.max(0.1, diagonal * 0.01),
    maxDistance: Math.max(100, diagonal * 5),
    far: Math.max(1000, diagonal * 10),
    near: Math.max(0.01, diagonal * 0.001)
  };
}


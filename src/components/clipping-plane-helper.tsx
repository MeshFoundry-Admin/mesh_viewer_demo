/**
 * Clipping Plane Visualization Helper Component
 * 
 * Displays clipping plane position visually as a semi-transparent rectangular plane.
 * 
 * @module components/ClippingPlaneHelper
 */

import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ClippingState } from '@/lib/mesh-core-adapter';
import {
  computePlanePosition,
  computePlaneRotation,
  computeHelperSize,
  quaternionToNormal,
  type BoundingBox
} from '../utils/clipping';

export interface ClippingPlaneHelperProps {
  /** Clipping state */
  clipping: ClippingState;
  /** Mesh bounding box */
  bbox: BoundingBox;
}

/**
 * Clipping Plane Visualization Helper
 * 
 * According to ux-spec §4:
 * - Color: #3B82F6 (blue-500, 30% opacity)
 * - Border: #60A5FA (blue-400)
 * - Size: 120% of bounding box diagonal
 * 
 * Free plane mode support: quaternion-based rotation applied
 */
export function ClippingPlaneHelper({ clipping, bbox }: ClippingPlaneHelperProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const lineRef = useRef<THREE.LineLoop>(null);

  // Plane size (120% of bbox diagonal)
  const size = useMemo(() => computeHelperSize(bbox), [bbox]);

  // Plane position (calculated differently based on mode)
  const position = useMemo(() => {
    if (clipping.mode === 'free') {
      const normal = quaternionToNormal(clipping.quaternion);
      const center = new THREE.Vector3(
        (bbox.min.x + bbox.max.x) / 2,
        (bbox.min.y + bbox.max.y) / 2,
        (bbox.min.z + bbox.max.z) / 2
      );
      const diagonal = new THREE.Vector3(
        bbox.max.x - bbox.min.x,
        bbox.max.y - bbox.min.y,
        bbox.max.z - bbox.min.z
      ).length();
      const t = (clipping.position / 100) - 0.5;
      return center.addScaledVector(normal, t * diagonal);
    }
    return computePlanePosition(clipping, bbox);
  }, [clipping, bbox]);

  // Plane quaternion (free mode: stored quaternion, axis mode: euler rotation)
  const quaternion = useMemo(() => {
    if (clipping.mode === 'free') {
      return new THREE.Quaternion(...clipping.quaternion);
    }
    // Axis mode: convert euler to quaternion
    const euler = computePlaneRotation(clipping.axis);
    return new THREE.Quaternion().setFromEuler(euler);
  }, [clipping.mode, clipping.quaternion, clipping.axis]);

  // Plane geometry
  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(size, size);
  }, [size]);

  // Check if plane is outside bounding box
  const isOutOfBounds = useMemo(() => {
    return clipping.position <= 0 || clipping.position >= 100;
  }, [clipping.position]);

  // Plane material (semi-transparent + polygonOffset to prevent z-fighting)
  // Edge Case: show more transparent if outside bounding box
  const material = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: isOutOfBounds ? 0xfbbf24 : 0x3b82f6,  // yellow if outside
      transparent: true,
      opacity: isOutOfBounds ? 0.15 : 0.3,  // more transparent if outside
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
  }, [isOutOfBounds]);

  // Edge geometry
  const edgeGeometry = useMemo(() => {
    const halfSize = size / 2;
    const points = [
      new THREE.Vector3(-halfSize, -halfSize, 0),
      new THREE.Vector3(halfSize, -halfSize, 0),
      new THREE.Vector3(halfSize, halfSize, 0),
      new THREE.Vector3(-halfSize, halfSize, 0)
    ];
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [size]);

  // Edge material
  const edgeMaterial = useMemo(() => {
    return new THREE.LineBasicMaterial({
      color: isOutOfBounds ? 0xf59e0b : 0x60a5fa,  // yellow if outside
      linewidth: 2
    });
  }, [isOutOfBounds]);

  return (
    <group position={position} quaternion={quaternion}>
      <mesh ref={meshRef} geometry={geometry} material={material} />
      <lineLoop ref={lineRef} geometry={edgeGeometry} material={edgeMaterial} />
    </group>
  );
}

/**
 * Clipping utility function tests
 * 
 * @module utils/clipping.test
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  quaternionToNormal,
  axisToQuaternion,
  quaternionToEulerDegrees,
  computeGizmoSize,
  computeClippingPlaneExtended,
  type BoundingBox
} from './clipping';

describe('quaternionToNormal', () => {
  it('identity quaternion returns Z+ direction normal', () => {
    const normal = quaternionToNormal([0, 0, 0, 1]);
    expect(normal.x).toBeCloseTo(0);
    expect(normal.y).toBeCloseTo(0);
    expect(normal.z).toBeCloseTo(1);
  });

  it('90-degree rotation around X-axis returns Y- direction normal (right-hand rule)', () => {
    // 90 degrees = π/2, Z+ → Y- (right-hand rule)
    const quat = new THREE.Quaternion();
    quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const normal = quaternionToNormal([quat.x, quat.y, quat.z, quat.w]);
    expect(normal.x).toBeCloseTo(0);
    expect(normal.y).toBeCloseTo(-1);  // Right-hand rule: positive rotation around X-axis → Y-
    expect(normal.z).toBeCloseTo(0);
  });

  it('90-degree rotation around Y-axis returns X+ direction normal', () => {
    const quat = new THREE.Quaternion();
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const normal = quaternionToNormal([quat.x, quat.y, quat.z, quat.w]);
    expect(normal.x).toBeCloseTo(1);
    expect(normal.y).toBeCloseTo(0);
    expect(normal.z).toBeCloseTo(0);
  });
});

describe('axisToQuaternion', () => {
  it('z-axis returns identity quaternion', () => {
    const quat = axisToQuaternion('z');
    expect(quat[0]).toBeCloseTo(0);
    expect(quat[1]).toBeCloseTo(0);
    expect(quat[2]).toBeCloseTo(0);
    expect(quat[3]).toBeCloseTo(1);
  });

  it('x-axis quaternion generates X+ direction normal', () => {
    const quat = axisToQuaternion('x');
    const normal = quaternionToNormal(quat);
    expect(normal.x).toBeCloseTo(1);
    expect(normal.y).toBeCloseTo(0);
    expect(normal.z).toBeCloseTo(0);
  });

  it('y-axis quaternion generates Y+ direction normal', () => {
    const quat = axisToQuaternion('y');
    const normal = quaternionToNormal(quat);
    expect(normal.x).toBeCloseTo(0);
    expect(normal.y).toBeCloseTo(1);
    expect(normal.z).toBeCloseTo(0);
  });
});

describe('quaternionToEulerDegrees', () => {
  it('identity quaternion returns (0, 0, 0)', () => {
    const degrees = quaternionToEulerDegrees([0, 0, 0, 1]);
    expect(degrees.x).toBeCloseTo(0);
    expect(degrees.y).toBeCloseTo(0);
    expect(degrees.z).toBeCloseTo(0);
  });

  it('45-degree rotation around X-axis returns x ≈ 45', () => {
    const quat = new THREE.Quaternion();
    quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 4);
    const degrees = quaternionToEulerDegrees([quat.x, quat.y, quat.z, quat.w]);
    expect(degrees.x).toBeCloseTo(45, 0);
  });

  it('90-degree rotation around Y-axis returns y ≈ 90', () => {
    const quat = new THREE.Quaternion();
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    const degrees = quaternionToEulerDegrees([quat.x, quat.y, quat.z, quat.w]);
    expect(degrees.y).toBeCloseTo(90, 0);
  });
});

describe('computeGizmoSize', () => {
  it('returns 30% of diagonal', () => {
    const bbox: BoundingBox = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 10, y: 10, z: 10 }
    };
    // diagonal = sqrt(10² + 10² + 10²) = sqrt(300) ≈ 17.32
    const size = computeGizmoSize(bbox);
    expect(size).toBeCloseTo(17.32 * 0.3, 1);
  });

  it('guarantees minimum value of 1.0', () => {
    const bbox: BoundingBox = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0.1, y: 0.1, z: 0.1 }
    };
    // diagonal = sqrt(0.01 * 3) ≈ 0.17, 30% = 0.05 → minimum 1.0
    const size = computeGizmoSize(bbox);
    expect(size).toBe(1.0);
  });
});

describe('computeClippingPlaneExtended', () => {
  const bbox: BoundingBox = {
    min: { x: -5, y: -5, z: -5 },
    max: { x: 5, y: 5, z: 5 }
  };

  it('uses existing logic in axis mode', () => {
    const clipping = {
      enabled: true,
      mode: 'axis' as const,
      axis: 'y' as const,
      quaternion: [0, 0, 0, 1] as [number, number, number, number],
      position: 50,
      flipped: false
    };
    const plane = computeClippingPlaneExtended(clipping, bbox);
    expect(plane.normal.y).toBeCloseTo(1);
    expect(plane.constant).toBeCloseTo(0); // center
  });

  it('uses quaternion-based normal in free mode', () => {
    // 45-degree rotation around X-axis (Z+ → tilted 45 degrees)
    const quat = new THREE.Quaternion();
    quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 4);
    
    const clipping = {
      enabled: true,
      mode: 'free' as const,
      axis: 'y' as const,
      quaternion: [quat.x, quat.y, quat.z, quat.w] as [number, number, number, number],
      position: 50,
      flipped: false
    };
    const plane = computeClippingPlaneExtended(clipping, bbox);
    
    // Normal rotated 45 degrees from Z+ toward Y- direction (right-hand rule)
    expect(plane.normal.y).toBeCloseTo(-Math.sin(Math.PI / 4));
    expect(plane.normal.z).toBeCloseTo(Math.cos(Math.PI / 4));
  });

  it('inverts normal in free mode when flipped=true', () => {
    const clipping = {
      enabled: true,
      mode: 'free' as const,
      axis: 'y' as const,
      quaternion: [0, 0, 0, 1] as [number, number, number, number],
      position: 50,
      flipped: true
    };
    const plane = computeClippingPlaneExtended(clipping, bbox);
    expect(plane.normal.z).toBeCloseTo(-1);
  });
});

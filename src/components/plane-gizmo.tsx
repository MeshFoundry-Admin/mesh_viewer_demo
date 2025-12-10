/**
 * Plane Gizmo Component
 * 
 * TransformControls-based 3D rotation/translation gizmo for manipulating clipping planes.
 * 
 * @module components/PlaneGizmo
 */

import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { TransformControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { GizmoMode } from '@/lib/mesh-core-adapter';
import type { TransformControls as TransformControlsImpl } from 'three-stdlib';

export interface PlaneGizmoProps {
  /** Plane position */
  position: THREE.Vector3;
  
  /** Plane rotation (quaternion) */
  quaternion: THREE.Quaternion;
  
  /** Gizmo mode (translate/rotate) */
  mode: GizmoMode;
  
  /** Gizmo size (based on bounding box) */
  size: number;
  
  /** Enabled state */
  enabled: boolean;
  
  /** Transform change callback */
  onTransformChange: (position: THREE.Vector3, quaternion: THREE.Quaternion) => void;
  
  /** Drag start callback */
  onDragStart?: () => void;
  
  /** Drag end callback */
  onDragEnd?: () => void;
}

/**
 * Plane Gizmo
 * 
 * According to spec §Edge Cases:
 * - translate mode: showX/showY=false (Z-axis only)
 * - space="local": plane-relative axis
 */
export function PlaneGizmo({
  position,
  quaternion,
  mode,
  size,
  enabled,
  onTransformChange,
  onDragStart,
  onDragEnd,
}: PlaneGizmoProps) {
  const { scene } = useThree();
  const controlsRef = useRef<TransformControlsImpl>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const isDraggingRef = useRef(false);
  const onTransformChangeRef = useRef(onTransformChange);
  
  // Update callback ref
  useEffect(() => {
    onTransformChangeRef.current = onTransformChange;
  }, [onTransformChange]);

  // Create mesh and add to scene (for TransformControls, visually hidden)
  useEffect(() => {
    const geometry = new THREE.PlaneGeometry(size, size);
    const material = new THREE.MeshBasicMaterial({
      visible: false,  // Visually hidden (ClippingPlaneHelper already displays it)
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.quaternion.copy(quaternion);
    meshRef.current = mesh;
    scene.add(mesh);
    
    return () => {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    };
  }, [scene, size]); // Recreate when size changes

  // Sync external state to mesh (only when not dragging)
  useEffect(() => {
    if (meshRef.current && !isDraggingRef.current) {
      meshRef.current.position.copy(position);
      meshRef.current.quaternion.copy(quaternion);
    }
  }, [position, quaternion]);

  // Attach mesh to TransformControls
  useEffect(() => {
    const controls = controlsRef.current;
    const mesh = meshRef.current;
    if (!controls || !mesh) return;
    
    controls.attach(mesh);
    
    return () => {
      controls.detach();
    };
  }, [size]); // Re-attach when size changes since mesh is also recreated

  // TransformControls event listeners
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const handleDraggingChanged = (event: { value: boolean }) => {
      isDraggingRef.current = event.value;
      if (event.value) {
        onDragStart?.();
      } else {
        onDragEnd?.();
      }
    };

    const handleObjectChange = () => {
      const mesh = meshRef.current;
      if (mesh && isDraggingRef.current) {
        onTransformChangeRef.current(
          mesh.position.clone(),
          mesh.quaternion.clone()
        );
      }
    };

    controls.addEventListener('dragging-changed', handleDraggingChanged as EventListener);
    controls.addEventListener('objectChange', handleObjectChange);
    
    return () => {
      controls.removeEventListener('dragging-changed', handleDraggingChanged as EventListener);
      controls.removeEventListener('objectChange', handleObjectChange);
    };
  }, [onDragStart, onDragEnd]);

  if (!enabled) {
    return null;
  }

  return (
    <TransformControls
      ref={controlsRef}
      mode={mode}
      space="local"
      showX={mode === 'rotate'}
      showY={mode === 'rotate'}
      showZ={true}
    />
  );
}

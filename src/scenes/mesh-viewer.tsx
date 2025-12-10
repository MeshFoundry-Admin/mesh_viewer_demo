import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, TrackballControls } from '@react-three/drei';
import * as THREE from 'three';
import { useViewerState } from '../hooks/use-viewer-state';
import type { MeshBuffers, OverlayToggles, ClippingState, GizmoMode } from '@/lib/mesh-core-adapter';
import { 
  computeClippingPlane, 
  computeClippingPlaneExtended,
  computePlanePosition, 
  computeHelperSize, 
  computePlaneRotation, 
  computeGizmoSize,
  computeCameraRange,
  quaternionToNormal,
  type BoundingBox 
} from '../utils/clipping';
import { ClippingPlaneHelper } from '../components/clipping-plane-helper';
import { PlaneGizmo } from '../components/plane-gizmo';

interface MeshObjectProps {
  buffers: MeshBuffers;
  overlays: OverlayToggles;
  clippingPlane: THREE.Plane | null;
}

function MeshObject({ buffers, overlays, clippingPlane }: MeshObjectProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // zero-copy: Float64Array → Float32Array (three.js compatible)
  const geometry = useMemo(() => {
    console.time('🎨 geometry_create');
    const geo = new THREE.BufferGeometry();

    // Convert Float64Array to Float32Array (three.js requires Float32)
    console.time('🎨 float64_to_float32');
    const positions = new Float32Array(buffers.vertexView.length);
    for (let i = 0; i < buffers.vertexView.length; i++) {
      positions[i] = buffers.vertexView[i];
    }
    console.timeEnd('🎨 float64_to_float32');
    
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Index buffer
    geo.setIndex(new THREE.BufferAttribute(buffers.indexView, 1));

    // Use normals if available, otherwise compute
    if (buffers.normalView) {
      geo.setAttribute('normal', new THREE.BufferAttribute(buffers.normalView, 3));
    } else {
      console.time('🎨 computeVertexNormals');
      geo.computeVertexNormals();
      console.timeEnd('🎨 computeVertexNormals');
    }

    console.time('🎨 computeBounding');
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    console.timeEnd('🎨 computeBounding');
    
    console.timeEnd('🎨 geometry_create');

    return geo;
  }, [buffers]);

  // vertex points geometry - lazy creation
  const pointsGeo = useMemo(() => {
    if (!overlays.vertices) {
      return null;
    }
    console.time('🎨 points_geometry');
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(buffers.vertexView.length);
    for (let i = 0; i < buffers.vertexView.length; i++) {
      positions[i] = buffers.vertexView[i];
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    console.timeEnd('🎨 points_geometry');
    return geo;
  }, [buffers, overlays.vertices]);

  // Shading material
  const material = useMemo(() => {
    const clippingPlanes = clippingPlane ? [clippingPlane] : [];
    if (overlays.smooth) {
      return new THREE.MeshStandardMaterial({
        color: 0x6699cc,
        flatShading: false,
        side: THREE.DoubleSide,
        clippingPlanes,
        // Prevent Z-fighting: depth offset at clipping boundary
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
      });
    }
    return new THREE.MeshStandardMaterial({
      color: 0x6699cc,
      flatShading: true,
      side: THREE.DoubleSide,
      clippingPlanes,
      // Prevent Z-fighting: depth offset at clipping boundary
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    });
  }, [overlays.smooth, clippingPlane]);

  // GPU-accelerated wireframe material (shader-based - immediate rendering)
  const wireframeMaterial = useMemo(() => {
    const clippingPlanes = clippingPlane ? [clippingPlane] : [];
    return new THREE.MeshBasicMaterial({
      color: 0x333333,
      wireframe: true,  // Direct GPU rendering
      side: THREE.DoubleSide,
      clippingPlanes,
      // Wireframe draws over solid, so use larger offset
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
  }, [clippingPlane]);

  const pointsMaterial = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: 0xff3366,
        size: 3,
        sizeAttenuation: false
      }),
    []
  );

  return (
    <group>
      {overlays.solid && (
        <mesh ref={meshRef} geometry={geometry} material={material} />
      )}
      {overlays.wireframe && (
        <mesh geometry={geometry} material={wireframeMaterial} />
      )}
      {overlays.vertices && pointsGeo && (
        <points geometry={pointsGeo} material={pointsMaterial} />
      )}
    </group>
  );
}

interface BoundingBoxHelperProps {
  buffers: MeshBuffers;
}

function BoundingBoxHelper({ buffers }: BoundingBoxHelperProps) {
  const boxRef = useRef<THREE.Box3Helper>(null);

  const box = useMemo(() => {
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

    const v = buffers.vertexView;
    for (let i = 0; i < v.length; i += 3) {
      min.x = Math.min(min.x, v[i]);
      min.y = Math.min(min.y, v[i + 1]);
      min.z = Math.min(min.z, v[i + 2]);
      max.x = Math.max(max.x, v[i]);
      max.y = Math.max(max.y, v[i + 1]);
      max.z = Math.max(max.z, v[i + 2]);
    }

    return new THREE.Box3(min, max);
  }, [buffers]);

  return <box3Helper ref={boxRef} args={[box, 0xff6600]} />;
}

interface NormalsHelperProps {
  buffers: MeshBuffers;
  size?: number;
}

function NormalsHelper({ buffers, size = 0.1 }: NormalsHelperProps) {
  const linesRef = useRef<THREE.LineSegments>(null);

  const geometry = useMemo(() => {
    const positions: number[] = [];
    const v = buffers.vertexView;

    // Temporary geometry for normal calculation
    const tempGeo = new THREE.BufferGeometry();
    const posArray = new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) {
      posArray[i] = v[i];
    }
    tempGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    tempGeo.setIndex(new THREE.BufferAttribute(buffers.indexView, 1));

    if (buffers.normalView) {
      tempGeo.setAttribute('normal', new THREE.BufferAttribute(buffers.normalView, 3));
    } else {
      tempGeo.computeVertexNormals();
    }

    const normals = tempGeo.getAttribute('normal');
    const vertexCount = Math.floor(v.length / 3);

    // Sampling: too many normals affect performance
    const step = Math.max(1, Math.floor(vertexCount / 5000));

    for (let i = 0; i < vertexCount; i += step) {
      const x = v[i * 3];
      const y = v[i * 3 + 1];
      const z = v[i * 3 + 2];

      const nx = normals.getX(i);
      const ny = normals.getY(i);
      const nz = normals.getZ(i);

      // Start point
      positions.push(x, y, z);
      // End point (normal direction)
      positions.push(x + nx * size, y + ny * size, z + nz * size);
    }

    tempGeo.dispose();

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geo;
  }, [buffers, size]);

  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: 0x00ff00,
        linewidth: 1
      }),
    []
  );

  return <lineSegments ref={linesRef} geometry={geometry} material={material} />;
}

function CameraController() {
  const { camera, controls } = useThree();
  const fitToView = useViewerState((s) => s.fitToView);
  const asset = useViewerState((s) => s.asset);
  const cameraState = useViewerState((s) => s.camera);
  const setCamera = useViewerState((s) => s.setCamera);

  useEffect(() => {
    if (!asset || !fitToView) return;

    const buffers = asset.buffers;
    const v = buffers.vertexView;

    // Calculate bbox
    const center = new THREE.Vector3(0, 0, 0);
    let maxDist = 0;

    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

    for (let i = 0; i < v.length; i += 3) {
      min.x = Math.min(min.x, v[i]);
      min.y = Math.min(min.y, v[i + 1]);
      min.z = Math.min(min.z, v[i + 2]);
      max.x = Math.max(max.x, v[i]);
      max.y = Math.max(max.y, v[i + 1]);
      max.z = Math.max(max.z, v[i + 2]);
    }

    center.addVectors(min, max).multiplyScalar(0.5);
    maxDist = min.distanceTo(max);

    const distance = maxDist * 1.5;

    // Dynamic camera range calculation and application (FR-011)
    const bbox = { min: { x: min.x, y: min.y, z: min.z }, max: { x: max.x, y: max.y, z: max.z } };
    const cameraRange = computeCameraRange(bbox);
    
    // Update camera frustum (supports both Perspective and Orthographic)
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.near = cameraRange.near;
      camera.far = cameraRange.far;
      camera.updateProjectionMatrix();
      
      // Update controls range (only for Perspective camera)
      if (controls && 'minDistance' in controls && 'maxDistance' in controls) {
        (controls as any).minDistance = cameraRange.minDistance;
        (controls as any).maxDistance = cameraRange.maxDistance;
      }
    } else if (camera instanceof THREE.OrthographicCamera) {
      camera.near = cameraRange.near;
      camera.far = cameraRange.far;
      // Set zoom level to fit mesh in view (higher zoom = closer view)
      const fitZoom = Math.max(1, 50 / maxDist);
      camera.zoom = fitZoom;
      camera.updateProjectionMatrix();
      
      // Update OrbitControls zoom limits for orthographic camera
      if (controls && 'minZoom' in controls && 'maxZoom' in controls) {
        (controls as any).minZoom = 0.01;
        (controls as any).maxZoom = 1000;
      }
    }

    setCamera({
      target: [center.x, center.y, center.z],
      distance
    });

    // Set camera position
    camera.position.set(
      center.x + distance * 0.7,
      center.y + distance * 0.5,
      center.z + distance * 0.7
    );
    camera.lookAt(center);

    // Update controls target to mesh center (critical for orbit/trackball rotation)
    if (controls && 'target' in controls) {
      (controls as any).target.copy(center);
      if ('update' in controls) {
        (controls as any).update();
      }
    }
  }, [asset, fitToView, camera, controls, setCamera]);

  return null;
}

function SceneContent() {
  const asset = useViewerState((s) => s.asset);
  const overlays = useViewerState((s) => s.overlays);
  const status = useViewerState((s) => s.status);
  const clipping = useViewerState((s) => s.clipping);
  const setClipping = useViewerState((s) => s.setClipping);
  
  // Local gizmo mode state
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('rotate');

  // Bounding box calculation
  const bbox = useMemo(() => {
    if (!asset?.buffers?.vertexView) {
      return null;
    }
    const v = asset.buffers.vertexView;
    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (let i = 0; i < v.length; i += 3) {
      min.x = Math.min(min.x, v[i]);
      min.y = Math.min(min.y, v[i + 1]);
      min.z = Math.min(min.z, v[i + 2]);
      max.x = Math.max(max.x, v[i]);
      max.y = Math.max(max.y, v[i + 1]);
      max.z = Math.max(max.z, v[i + 2]);
    }
    return { min, max };
  }, [asset?.buffers]);

  // Clipping plane calculation (mode-aware)
  const clippingPlane = useMemo(() => {
    if (!clipping.enabled || !bbox) {
      return null;
    }
    return computeClippingPlaneExtended(clipping, bbox);
  }, [clipping, bbox]);

  // Gizmo size calculation
  const gizmoSize = useMemo(() => {
    if (!bbox) return 1;
    return computeGizmoSize(bbox);
  }, [bbox]);

  // Gizmo position calculation
  const gizmoPosition = useMemo(() => {
    if (!bbox) return new THREE.Vector3();
    // Free mode: calculate position using quaternion-based normal
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
    // Axis mode: existing logic
    return computePlanePosition(clipping, bbox);
  }, [clipping, bbox]);

  // Gizmo quaternion
  const gizmoQuaternion = useMemo(() => {
    return new THREE.Quaternion(...clipping.quaternion);
  }, [clipping.quaternion]);

  // Gizmo transform handler
  const handleTransformChange = useCallback((position: THREE.Vector3, quaternion: THREE.Quaternion) => {
    if (!bbox) return;
    
    // Update quaternion
    const newQuaternion: [number, number, number, number] = [
      quaternion.x,
      quaternion.y,
      quaternion.z,
      quaternion.w
    ];
    
    // Reverse calculate slider value from position (free mode)
    if (clipping.mode === 'free') {
      const normal = quaternionToNormal(newQuaternion);
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
      
      // Calculate normal direction offset
      const offset = position.clone().sub(center).dot(normal);
      const t = offset / diagonal + 0.5;
      const newPosition = Math.max(0, Math.min(100, t * 100));
      
      setClipping({ quaternion: newQuaternion, position: newPosition });
    } else {
      setClipping({ quaternion: newQuaternion });
    }
  }, [bbox, clipping.mode, setClipping]);

  // Keyboard shortcuts: T (translate), R (rotate)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if not in free mode
      if (clipping.mode !== 'free' || !clipping.enabled) return;
      // Ignore in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setGizmoMode('translate');
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setGizmoMode('rotate');
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clipping.mode, clipping.enabled]);

  // Calculate normal length based on bbox diagonal
  // Hooks must always be called before conditionals (Rules of Hooks)
  const normalSize = useMemo(() => {
    if (!asset?.buffers?.vertexView) {
      return 0.1; // default value
    }
    const v = asset.buffers.vertexView;
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    for (let i = 0; i < v.length; i += 3) {
      min.x = Math.min(min.x, v[i]);
      min.y = Math.min(min.y, v[i + 1]);
      min.z = Math.min(min.z, v[i + 2]);
      max.x = Math.max(max.x, v[i]);
      max.y = Math.max(max.y, v[i + 1]);
      max.z = Math.max(max.z, v[i + 2]);
    }
    const diagonal = min.distanceTo(max);
    return diagonal * 0.02; // 2% of diagonal
  }, [asset?.buffers]);

  // Mesh center for camera target
  const meshCenter = useMemo(() => {
    if (!bbox) return new THREE.Vector3(0, 0, 0);
    return new THREE.Vector3(
      (bbox.min.x + bbox.max.x) / 2,
      (bbox.min.y + bbox.max.y) / 2,
      (bbox.min.z + bbox.max.z) / 2
    );
  }, [bbox]);

  // Conditional rendering comes after all Hook calls
  if (status !== 'Ready' || !asset) {
    return null;
  }

  return (
    <>
      <MeshObject buffers={asset.buffers} overlays={overlays} clippingPlane={clippingPlane} />
      {overlays.bbox && <BoundingBoxHelper buffers={asset.buffers} />}
      {overlays.normals && <NormalsHelper buffers={asset.buffers} size={normalSize} />}
      {clipping.enabled && bbox && <ClippingPlaneHelper clipping={clipping} bbox={bbox} />}
      {/* PlaneGizmo: only shown in free mode */}
      {clipping.enabled && clipping.mode === 'free' && bbox && (
        <PlaneGizmo
          position={gizmoPosition}
          quaternion={gizmoQuaternion}
          mode={gizmoMode}
          size={gizmoSize}
          enabled={true}
          onTransformChange={handleTransformChange}
        />
      )}
      <CameraController />
      {/* OrbitControls with mesh center as target - better orthographic support */}
      <OrbitControls
        makeDefault
        target={meshCenter}
        enableDamping
        dampingFactor={0.1}
        rotateSpeed={1.0}
        panSpeed={1.0}
        zoomSpeed={1.0}
        screenSpacePanning={true}
        minZoom={0.01}
        maxZoom={1000}
      />
    </>
  );
}

// Camera control mode type (can be used for switching later)
// export type CameraControlMode = 'orbit' | 'trackball';

export function MeshViewer() {
  const status = useViewerState((s) => s.status);
  // Activate state below if camera mode switching is needed
  // const [cameraControlMode, setCameraControlMode] = useState<CameraControlMode>('trackball');

  return (
    <div className="mesh-viewer" data-testid="mesh-viewer">
      {/* 
        Camera control mode selection UI (currently disabled - Trackball fixed)
        Activate UI below if Orbit/Trackball switching is needed later
      <div 
        style={{ 
          position: 'absolute', 
          top: 10, 
          right: 10, 
          zIndex: 100,
          background: 'rgba(0, 0, 0, 0.7)',
          padding: '8px 12px',
          borderRadius: '6px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          fontSize: '12px',
          color: 'white'
        }}
      >
        <span>Camera:</span>
        <button
          onClick={() => setCameraControlMode('orbit')}
          style={{
            padding: '4px 8px',
            background: cameraControlMode === 'orbit' ? '#4a9eff' : '#444',
            border: 'none',
            borderRadius: '4px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '11px'
          }}
        >
          Orbit (Spherical)
        </button>
        <button
          onClick={() => setCameraControlMode('trackball')}
          style={{
            padding: '4px 8px',
            background: cameraControlMode === 'trackball' ? '#4a9eff' : '#444',
            border: 'none',
            borderRadius: '4px',
            color: 'white',
            cursor: 'pointer',
            fontSize: '11px'
          }}
        >
          Trackball (Free)
        </button>
      </div>
      */}

      <Canvas
        orthographic
        camera={{ zoom: 50, near: 0.1, far: 10000, position: [5, 3, 5] }}
        style={{ width: '100%', height: '100%' }}
        gl={{ 
          localClippingEnabled: true,
          logarithmicDepthBuffer: true  // Reduce Z-fighting: more precise depth buffer
        }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 10]} intensity={0.8} />
        <directionalLight position={[-10, -10, -10]} intensity={0.3} />

        <SceneContent />

        {/* Grid and default controls (for Idle state) */}
        {status === 'Idle' && (
          <>
            <gridHelper args={[10, 10, 0x888888, 0xcccccc]} />
            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.1}
              rotateSpeed={1.0}
              panSpeed={1.0}
              zoomSpeed={1.0}
              screenSpacePanning={true}
              minZoom={0.01}
              maxZoom={1000}
            />
          </>
        )}
      </Canvas>

      {status === 'Idle' && (
        <div className="viewer-placeholder">
          <p>Drop a mesh file here to display</p>
        </div>
      )}
    </div>
  );
}

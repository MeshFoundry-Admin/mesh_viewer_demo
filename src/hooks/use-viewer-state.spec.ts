/**
 * useViewerState hook unit tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useViewerState } from './use-viewer-state';
import type { MeshAsset } from '@/lib/mesh-core-adapter';

describe('useViewerState', () => {
  beforeEach(() => {
    // Reset state
    useViewerState.setState({
      status: 'Idle',
      activeAssetId: null,
      asset: null,
      camera: {
        target: [0, 0, 0],
        distance: 5,
        azimuth: 45,
        elevation: 30
      },
      overlays: {
        solid: true,
        smooth: false,
        wireframe: false,
        vertices: false,
        normals: false,
        bbox: false
      },
      fitToView: true,
      error: null
    });
  });

  it('Initial state should be Idle', () => {
    const state = useViewerState.getState();
    expect(state.status).toBe('Idle');
    expect(state.activeAssetId).toBeNull();
    expect(state.asset).toBeNull();
    expect(state.error).toBeNull();
  });

  it('Should transition to Loading state when startLoading is called', () => {
    const { startLoading } = useViewerState.getState();
    startLoading();

    const state = useViewerState.getState();
    expect(state.status).toBe('Loading');
    expect(state.error).toBeNull();
  });

  it('Should set Ready state and asset when setReady is called', () => {
    const mockAsset: MeshAsset = {
      id: 'test-123',
      fileName: 'test.stl',
      fileSizeBytes: 1024,
      format: 'stl',
      loadedAt: Date.now(),
      loadDurationMs: 100,
      buffers: {
        vertexView: new Float64Array([0, 0, 0]),
        indexView: new Uint32Array([0, 1, 2]),
        normalView: new Float32Array([0, 1, 0]),
        generation: 1,
        release: () => {}
      }
    };

    const { setReady } = useViewerState.getState();
    setReady(mockAsset);

    const state = useViewerState.getState();
    expect(state.status).toBe('Ready');
    expect(state.activeAssetId).toBe('test-123');
    expect(state.asset).toEqual(mockAsset);
  });

  it('Should set Error state and error info when setError is called', () => {
    const { setError } = useViewerState.getState();
    setError({ code: 'TEST_ERROR', message: 'test error' });

    const state = useViewerState.getState();
    expect(state.status).toBe('Error');
    expect(state.error?.code).toBe('TEST_ERROR');
    expect(state.error?.message).toBe('test error');
  });

  it('Should reset camera to default values when resetView is called', () => {
    const { setCamera, resetView } = useViewerState.getState();
    
    // Change camera state
    setCamera({ distance: 10, azimuth: 90 });
    expect(useViewerState.getState().camera.distance).toBe(10);
    
    // Reset
    resetView();
    const state = useViewerState.getState();
    expect(state.camera.distance).toBe(5);
    expect(state.camera.azimuth).toBe(45);
    expect(state.fitToView).toBe(true);
  });

  it('Should toggle overlay when toggleOverlay is called', () => {
    const { toggleOverlay } = useViewerState.getState();
    
    expect(useViewerState.getState().overlays.wireframe).toBe(false);
    
    toggleOverlay('wireframe');
    expect(useViewerState.getState().overlays.wireframe).toBe(true);
    
    toggleOverlay('wireframe');
    expect(useViewerState.getState().overlays.wireframe).toBe(false);
  });

  it('Should clean up asset and transition to Idle state when clearAsset is called', () => {
    const mockRelease = vi.fn();
    const mockAsset: MeshAsset = {
      id: 'test-456',
      fileName: 'test.obj',
      fileSizeBytes: 2048,
      format: 'obj',
      loadedAt: Date.now(),
      loadDurationMs: 50,
      buffers: {
        vertexView: new Float64Array([0, 0, 0]),
        indexView: new Uint32Array([0, 1, 2]),
        generation: 1,
        release: mockRelease
      }
    };

    const { setReady, clearAsset } = useViewerState.getState();
    setReady(mockAsset);
    
    expect(useViewerState.getState().status).toBe('Ready');
    
    clearAsset();
    
    expect(mockRelease).toHaveBeenCalled();
    const state = useViewerState.getState();
    expect(state.status).toBe('Idle');
    expect(state.asset).toBeNull();
    expect(state.activeAssetId).toBeNull();
  });
});

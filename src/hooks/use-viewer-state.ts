import { create } from 'zustand';
import type {
  ClippingState,
  MeshAsset,
  OverlayToggles,
  ViewerCameraState,
  ViewerError,
  ViewerStateStatus
} from '@/lib/mesh-core-adapter';
import { DEFAULT_CLIPPING_STATE } from '@/lib/mesh-core-adapter';

const DEFAULT_CAMERA: ViewerCameraState = {
  target: [0, 0, 0],
  distance: 5,
  azimuth: 45,
  elevation: 30
};

const DEFAULT_OVERLAYS: OverlayToggles = {
  solid: true,
  smooth: false,
  wireframe: false,
  vertices: false,
  normals: false,
  bbox: false
};

export interface ViewerStoreState {
  status: ViewerStateStatus;
  activeAssetId: string | null;
  asset: MeshAsset | null;
  camera: ViewerCameraState;
  overlays: OverlayToggles;
  fitToView: boolean;
  error: ViewerError | null;
  /** Clipping state */
  clipping: ClippingState;
  /** Whether clipping is being applied */
  isApplyingClipping: boolean;
}

export interface ViewerStoreActions {
  startLoading: () => void;
  setReady: (asset: MeshAsset) => void;
  setError: (error: ViewerError) => void;
  resetView: () => void;
  setCamera: (camera: Partial<ViewerCameraState>) => void;
  toggleOverlay: (key: keyof OverlayToggles) => void;
  setFitToView: (enabled: boolean) => void;
  clearAsset: () => void;
  /** Partial update of clipping state */
  setClipping: (partial: Partial<ClippingState>) => void;
  /** Toggle clipping */
  toggleClipping: () => void;
  /** Reset clipping (on mesh load/reset) */
  resetClipping: () => void;
  /** Apply clipping (actual mesh cutting) */
  applyClipping: () => Promise<void>;
  /** Set clipping apply state */
  setApplyingClipping: (isApplying: boolean) => void;
}

export type ViewerStore = ViewerStoreState & ViewerStoreActions;

export const useViewerState = create<ViewerStore>((set, get) => ({
  status: 'Idle',
  activeAssetId: null,
  asset: null,
  camera: { ...DEFAULT_CAMERA },
  overlays: { ...DEFAULT_OVERLAYS },
  fitToView: true,
  error: null,
  clipping: { ...DEFAULT_CLIPPING_STATE },
  isApplyingClipping: false,

  startLoading: () =>
    set({
      status: 'Loading',
      error: null
    }),

  setReady: (asset: MeshAsset) =>
    set({
      status: 'Ready',
      activeAssetId: asset.id,
      asset,
      error: null,
      // Reset clipping on new mesh load
      clipping: { ...DEFAULT_CLIPPING_STATE }
    }),

  setError: (error: ViewerError) =>
    set({
      status: 'Error',
      error
    }),

  resetView: () =>
    set({
      camera: { ...DEFAULT_CAMERA },
      fitToView: true
    }),

  setCamera: (partial: Partial<ViewerCameraState>) =>
    set((state) => ({
      camera: { ...state.camera, ...partial }
    })),

  toggleOverlay: (key: keyof OverlayToggles) =>
    set((state) => ({
      overlays: {
        ...state.overlays,
        [key]: !state.overlays[key]
      }
    })),

  setFitToView: (enabled: boolean) =>
    set({ fitToView: enabled }),

  clearAsset: () => {
    const current = get().asset;
    if (current?.buffers) {
      current.buffers.release();
    }
    set({
      status: 'Idle',
      activeAssetId: null,
      asset: null,
      error: null,
      clipping: { ...DEFAULT_CLIPPING_STATE }
    });
  },

  setClipping: (partial: Partial<ClippingState>) =>
    set((state) => ({
      clipping: { ...state.clipping, ...partial }
    })),

  toggleClipping: () =>
    set((state) => ({
      clipping: { ...state.clipping, enabled: !state.clipping.enabled }
    })),

  resetClipping: () =>
    set({ clipping: { ...DEFAULT_CLIPPING_STATE } }),

  setApplyingClipping: (isApplying: boolean) =>
    set({ isApplyingClipping: isApplying }),

  applyClipping: async () => {
    const { asset, clipping, isApplyingClipping } = get();
    
    // Ignore if already applying
    if (isApplyingClipping) return;
    
    // Ignore if no mesh loaded
    if (!asset) {
      console.warn('[applyClipping] No asset loaded');
      return;
    }
    
    // Ignore if clipping is not enabled
    if (!clipping.enabled) {
      console.warn('[applyClipping] Clipping is not enabled');
      return;
    }
    
    set({ isApplyingClipping: true });
    
    try {
      // sliceMesh call is handled in App.tsx (requires WASM module access)
      // Only update state here
      console.log('[applyClipping] Clipping state:', clipping);
      
      // Actual implementation is injected externally or handled via events
      // This stub will be overridden in App.tsx later
      
    } catch (error) {
      console.error('[applyClipping] Error:', error);
      set({
        error: {
          code: 'Slice.Failed',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      });
    } finally {
      set({ isApplyingClipping: false });
    }
  }
}));

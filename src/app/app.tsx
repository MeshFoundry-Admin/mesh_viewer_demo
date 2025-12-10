import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { ClippingPanel, DiagnosticsPanel, OverlayPanel, StatisticsPanel } from '@/lib/viewer-ui';
import type { MeshStats } from '@/lib/viewer-ui';
import { FileDropzone } from '../components/file-dropzone';
import { MeshViewer } from '../scenes/mesh-viewer';
import { useViewerState } from '../hooks/use-viewer-state';
import { quaternionToEulerDegrees } from '../utils/clipping';
import {
  loadMeshAsset,
  computeMeshStats,
  bootstrapEmbindBridge,
  type MeshCoreBridge,
  type MeshCoreCapabilities
} from '@/lib/mesh-core-adapter';

/** Toast notification state */
interface ToastState {
  message: string;
  type: 'success' | 'error' | 'warning';
  visible: boolean;
}

export function App() {
  const status = useViewerState((s) => s.status);
  const error = useViewerState((s) => s.error);
  const asset = useViewerState((s) => s.asset);
  const overlays = useViewerState((s) => s.overlays);
  const clipping = useViewerState((s) => s.clipping);
  const isApplyingClipping = useViewerState((s) => s.isApplyingClipping);
  const startLoading = useViewerState((s) => s.startLoading);
  const setReady = useViewerState((s) => s.setReady);
  const setError = useViewerState((s) => s.setError);
  const resetView = useViewerState((s) => s.resetView);
  const toggleOverlay = useViewerState((s) => s.toggleOverlay);
  const setClipping = useViewerState((s) => s.setClipping);
  const toggleClipping = useViewerState((s) => s.toggleClipping);
  const setApplyingClipping = useViewerState((s) => s.setApplyingClipping);

  // Toast state
  const [toast, setToast] = useState<ToastState>({ message: '', type: 'success', visible: false });
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((message: string, type: ToastState['type'] = 'success') => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ message, type, visible: true });
    toastTimeoutRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 3000);
  }, []);

  // Core WASM bridge state
  const bridgeRef = useRef<MeshCoreBridge | null>(null);
  const capabilitiesRef = useRef<MeshCoreCapabilities>({
    binaryPlyEnabled: false,
    wasmVersion: '0.0.0-loading'
  });
  const [coreReady, setCoreReady] = useState(false);
  const [coreError, setCoreError] = useState<string | null>(null);

  // Core WASM module initialization
  useEffect(() => {
    let cancelled = false;

    bootstrapEmbindBridge('/core')
      .then(({ bridge, capabilities }) => {
        if (cancelled) return;
        bridgeRef.current = bridge;
        capabilitiesRef.current = capabilities;
        setCoreReady(true);
        console.log('[App] Core WASM loaded:', capabilities);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[App] Core WASM load failed:', err);
        setCoreError(err.message ?? 'Failed to load WASM module');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Statistics state
  const [stats, setStats] = useState<MeshStats | null>(null);
  const [statsUpdatedAt, setStatsUpdatedAt] = useState<number | null>(null);

  // Recompute statistics only when activeAssetId changes
  useEffect(() => {
    if (asset && asset.buffers) {
      const computed = computeMeshStats(asset.buffers);
      setStats(computed);
      setStatsUpdatedAt(Date.now());
    } else {
      setStats(null);
      setStatsUpdatedAt(null);
    }
  }, [asset?.id]); // Recompute only when asset.id changes

  const logs = useMemo(
    () => [
      'Mesh Viewer Demo shell loaded',
      `Core WASM: ${coreReady ? capabilitiesRef.current.wasmVersion : (coreError ?? 'Loading...')}`,
      `Current status: ${status}`
    ],
    [status, coreReady, coreError]
  );

  const handleFileSelected = useCallback(
    async (file: File) => {
      if (!bridgeRef.current) {
        setError({
          code: 'Core.not_ready',
          message: 'WASM module has not been loaded yet.'
        });
        return;
      }

      startLoading();

      try {
        const result = await loadMeshAsset(file, {
          bridge: bridgeRef.current,
          capabilities: capabilitiesRef.current
        });

        if (result.status === 'success' && result.asset) {
          setReady(result.asset);
        } else if (result.status === 'error' && result.error) {
          setError({
            code: result.error.code,
            message: result.error.message
          });
        } else {
          setError({
            code: 'Core.unknown_error',
            message: 'An unknown error occurred.'
          });
        }
      } catch (err) {
        setError({
          code: 'Core.parse_failed',
          message: (err as Error).message ?? 'Unknown error'
        });
      }
    },
    [startLoading, setReady, setError]
  );

  // Clipping apply handler
  const handleApplyClipping = useCallback(async () => {
    if (!asset || !clipping.enabled || isApplyingClipping) {
      return;
    }

    setApplyingClipping(true);

    try {
      // TODO: Implement actual sliceMesh call
      // Will be integrated after WASM build
      // const result = await sliceMesh(module, asset.buffers, plane);
      
      console.log('[App] Apply clipping:', clipping);
      
      // Temporary success simulation (0.5s delay)
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      showToast('✂️ Clipping applied', 'success');
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      
      if (message.includes('EmptyResult')) {
        showToast('⚠️ All faces have been clipped', 'warning');
      } else {
        showToast(`❌ Clipping failed: ${message}`, 'error');
      }
    } finally {
      setApplyingClipping(false);
    }
  }, [asset, clipping, isApplyingClipping, setApplyingClipping, showToast]);

  return (
    <div className="app-shell">
      <header>
        <h1>Mesh Viewer Demo</h1>
        <div className="header-actions">
          <span className={`status-badge status-${status.toLowerCase()}`}>
            {status}
          </span>
          {status === 'Ready' && (
            <button type="button" onClick={resetView} className="btn-reset">
              Reset View
            </button>
          )}
        </div>
      </header>

      <main>
        <section className="viewer-container">
          <MeshViewer />
          {status === 'Idle' && (
            <div className="dropzone-overlay">
              {coreError ? (
                <div className="core-error">
                  <p>⚠️ Failed to load WASM module</p>
                  <p className="error-detail">{coreError}</p>
                </div>
              ) : !coreReady ? (
                <div className="core-loading">
                  <p>⏳ Loading WASM module...</p>
                </div>
              ) : (
                <FileDropzone onFileSelected={handleFileSelected} />
              )}
            </div>
          )}
        </section>

        {status === 'Error' && error && (
          <div className="error-banner" role="alert">
            <strong>Error:</strong> {error.message} ({error.code})
          </div>
        )}

        <aside className="sidebar">
          <OverlayPanel
            overlays={overlays}
            onToggle={toggleOverlay}
          />
          <ClippingPanel
            clipping={clipping}
            onChange={setClipping}
            onToggle={toggleClipping}
            onApply={handleApplyClipping}
            isApplying={isApplyingClipping}
            hasMesh={status === 'Ready' && !!asset}
            eulerDegrees={clipping.mode === 'free' ? quaternionToEulerDegrees(clipping.quaternion) : undefined}
          />
          <StatisticsPanel
            stats={stats}
            updatedAt={statsUpdatedAt}
          />
          <DiagnosticsPanel>
            <ul>
              {logs.map((log, idx) => (
                <li key={idx}>{log}</li>
              ))}
            </ul>
          </DiagnosticsPanel>
        </aside>
      </main>

      {/* Toast notification */}
      {toast.visible && (
        <div 
          className={`toast toast--${toast.type}`}
          role="alert"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

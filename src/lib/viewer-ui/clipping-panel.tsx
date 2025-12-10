/**
 * Clipping Panel Component
 * 
 * UI for clipping functionality that cuts 3D meshes with a plane in mesh-viewer-demo.
 * 
 * @module viewer-ui/ClippingPanel
 */

import type { FC, ChangeEvent, KeyboardEvent } from 'react';
import './clipping-panel.css';

/**
 * Clipping axis direction
 */
export type ClippingAxis = 'x' | 'y' | 'z';

/**
 * Clipping mode
 */
export type ClippingMode = 'axis' | 'free';

/**
 * Gizmo manipulation mode
 */
export type GizmoMode = 'translate' | 'rotate';

/**
 * Clipping state (viewer-ui internal type)
 */
export interface ClippingState {
  enabled: boolean;
  mode: ClippingMode;
  axis: ClippingAxis;
  quaternion: [number, number, number, number];
  position: number;
  flipped: boolean;
  lastFreeQuaternion?: [number, number, number, number];
}

/**
 * ClippingPanel Props
 */
export interface ClippingPanelProps {
  /** Current clipping state */
  clipping: ClippingState;
  /** Clipping state change handler */
  onChange: (partial: Partial<ClippingState>) => void;
  /** Clipping toggle handler */
  onToggle: () => void;
  /** Clipping apply handler (actual mesh cutting) */
  onApply?: () => void;
  /** Whether applying is in progress (loading state) */
  isApplying?: boolean;
  /** Whether a mesh is loaded */
  hasMesh?: boolean;
  /** Collapsed state */
  collapsed?: boolean;
  /** Collapse toggle handler */
  onCollapseToggle?: () => void;
  /** Additional class name */
  className?: string;
  /** Gizmo mode (free plane mode only) */
  gizmoMode?: GizmoMode;
  /** Gizmo mode change handler */
  onGizmoModeChange?: (mode: GizmoMode) => void;
  /** Euler angle display (read-only) */
  eulerDegrees?: { x: number; y: number; z: number };
}

const AXIS_OPTIONS: { value: ClippingAxis; label: string }[] = [
  { value: 'x', label: 'X' },
  { value: 'y', label: 'Y' },
  { value: 'z', label: 'Z' }
];

const MODE_OPTIONS: { value: ClippingMode; label: string }[] = [
  { value: 'axis', label: 'Axis' },
  { value: 'free', label: 'Free' }
];

/**
 * Clipping Panel Component
 * 
 * Provides axis selection, position slider, and direction flip.
 * 
 * @example
 * ```tsx
 * <ClippingPanel
 *   clipping={clipping}
 *   onChange={(partial) => setClipping({ ...clipping, ...partial })}
 *   onToggle={() => setClipping({ ...clipping, enabled: !clipping.enabled })}
 *   hasMesh={true}
 * />
 * ```
 */
export const ClippingPanel: FC<ClippingPanelProps> = ({
  clipping,
  onChange,
  onToggle,
  onApply,
  isApplying = false,
  hasMesh = false,
  collapsed = false,
  onCollapseToggle,
  className = '',
  gizmoMode = 'rotate',
  onGizmoModeChange,
  eulerDegrees
}) => {
  const isDisabled = !hasMesh;
  const isControlsDisabled = isDisabled || !clipping.enabled;
  const isFreeMode = clipping.mode === 'free';

  const handleModeChange = (mode: ClippingMode) => {
    if (mode === 'free' && clipping.mode === 'axis') {
      // axis → free: restore lastFreeQuaternion if available
      if (clipping.lastFreeQuaternion) {
        onChange({ mode, quaternion: clipping.lastFreeQuaternion });
      } else {
        onChange({ mode });
      }
    } else if (mode === 'axis' && clipping.mode === 'free') {
      // free → axis: save current quaternion to lastFreeQuaternion
      onChange({ mode, lastFreeQuaternion: clipping.quaternion });
    } else {
      onChange({ mode });
    }
  };

  const handleAxisChange = (axis: ClippingAxis) => {
    onChange({ axis });
  };

  const handlePositionChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange({ position: Number(e.target.value) });
  };

  const handleSliderKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Keyboard step: 5%
    const step = 5;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      const newPos = Math.max(0, clipping.position - step);
      onChange({ position: newPos });
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      const newPos = Math.min(100, clipping.position + step);
      onChange({ position: newPos });
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange({ position: 0 });
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange({ position: 100 });
    }
  };

  const handleFlipToggle = () => {
    onChange({ flipped: !clipping.flipped });
  };

  // Display when no mesh is loaded
  if (!hasMesh) {
    return (
      <section
        className={`clipping-panel clipping-panel--disabled ${className}`}
        data-testid="clipping-panel"
        aria-label="Clipping settings"
      >
        <header className="clipping-panel__header">
          <h3>📐 Clipping</h3>
          {onCollapseToggle && (
            <button
              type="button"
              className="clipping-panel__collapse-btn"
              onClick={onCollapseToggle}
              aria-label={collapsed ? 'Expand' : 'Collapse'}
            >
              {collapsed ? '▶' : '▼'}
            </button>
          )}
        </header>
        {!collapsed && (
          <div className="clipping-panel__content clipping-panel__placeholder">
            Please load a mesh first
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      className={`clipping-panel ${clipping.enabled ? 'clipping-panel--active' : ''} ${className}`}
      data-testid="clipping-panel"
      aria-label="Clipping Settings"
    >
      {/* Header */}
      <header className="clipping-panel__header">
        <h3>📐 Clipping</h3>
        {onCollapseToggle && (
          <button
            type="button"
            className="clipping-panel__collapse-btn"
            onClick={onCollapseToggle}
            aria-label={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '▶' : '▼'}
          </button>
        )}
      </header>

      {!collapsed && (
        <div className="clipping-panel__content">
          {/* Enable toggle */}
          <div className="clipping-panel__row">
            <label className="clipping-panel__toggle">
              <span className="clipping-panel__toggle-label">Enable</span>
              <button
                type="button"
                role="switch"
                aria-checked={clipping.enabled}
                aria-label="Enable clipping"
                className={`clipping-panel__switch ${clipping.enabled ? 'clipping-panel__switch--on' : ''}`}
                onClick={onToggle}
                disabled={isDisabled}
              >
                <span className="clipping-panel__switch-thumb" />
              </button>
            </label>
          </div>

          {/* Mode selection (axis/free) */}
          <div className="clipping-panel__row">
            <span className="clipping-panel__label">Mode:</span>
            <div
              className="clipping-panel__mode-group"
              role="radiogroup"
              aria-label="Clipping mode selection"
            >
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={clipping.mode === opt.value}
                  className={`clipping-panel__mode-btn ${
                    clipping.mode === opt.value ? 'clipping-panel__mode-btn--selected' : ''
                  }`}
                  onClick={() => handleModeChange(opt.value)}
                  disabled={isControlsDisabled}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Axis selection (axis mode only) */}
          {!isFreeMode && (
            <div className="clipping-panel__row">
              <span className="clipping-panel__label">Axis:</span>
              <div
                className="clipping-panel__axis-group"
                role="radiogroup"
                aria-label="Cutting axis selection"
              >
                {AXIS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={clipping.axis === opt.value}
                    className={`clipping-panel__axis-btn ${
                      clipping.axis === opt.value ? 'clipping-panel__axis-btn--selected' : ''
                    }`}
                    onClick={() => handleAxisChange(opt.value)}
                    disabled={isControlsDisabled}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Gizmo mode toggle (free mode only) */}
          {isFreeMode && onGizmoModeChange && (
            <div className="clipping-panel__row">
              <span className="clipping-panel__label">Control:</span>
              <div
                className="clipping-panel__gizmo-group"
                role="radiogroup"
                aria-label="Gizmo control mode selection"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={gizmoMode === 'rotate'}
                  className={`clipping-panel__gizmo-btn ${
                    gizmoMode === 'rotate' ? 'clipping-panel__gizmo-btn--selected' : ''
                  }`}
                  onClick={() => onGizmoModeChange('rotate')}
                  disabled={isControlsDisabled}
                  title="Rotate (R)"
                >
                  🔄 Rotate
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={gizmoMode === 'translate'}
                  className={`clipping-panel__gizmo-btn ${
                    gizmoMode === 'translate' ? 'clipping-panel__gizmo-btn--selected' : ''
                  }`}
                  onClick={() => onGizmoModeChange('translate')}
                  disabled={isControlsDisabled}
                  title="Translate (T)"
                >
                  ↕️ Translate
                </button>
              </div>
            </div>
          )}

          {/* Euler angle display (free mode only, read-only) */}
          {isFreeMode && eulerDegrees && (
            <div className="clipping-panel__row clipping-panel__euler-row">
              <span className="clipping-panel__label">Angle:</span>
              <span className="clipping-panel__euler-value" aria-label="Euler angles">
                X: {eulerDegrees.x}° Y: {eulerDegrees.y}° Z: {eulerDegrees.z}°
              </span>
            </div>
          )}

          {/* Position slider */}
          <div className="clipping-panel__row clipping-panel__slider-row">
            <label className="clipping-panel__label" htmlFor="clipping-position">
              Position:
            </label>
            <input
              id="clipping-position"
              type="range"
              min={0}
              max={100}
              step={1}
              value={clipping.position}
              onChange={handlePositionChange}
              onKeyDown={handleSliderKeyDown}
              disabled={isControlsDisabled}
              className="clipping-panel__slider"
              aria-label="Clipping position"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={clipping.position}
            />
            <span className="clipping-panel__value">{clipping.position}%</span>
          </div>

          {/* Flip button */}
          <div className="clipping-panel__row">
            <button
              type="button"
              className={`clipping-panel__flip-btn ${
                clipping.flipped ? 'clipping-panel__flip-btn--active' : ''
              }`}
              onClick={handleFlipToggle}
              disabled={isControlsDisabled}
              aria-pressed={clipping.flipped}
              aria-label="Flip direction"
            >
              ↔ Flip
            </button>
          </div>

          {/* Apply button */}
          {onApply && (
            <div className="clipping-panel__row clipping-panel__apply-row">
              <button
                type="button"
                className={`clipping-panel__apply-btn ${isApplying ? 'clipping-panel__apply-btn--loading' : ''}`}
                onClick={onApply}
                disabled={isControlsDisabled || isApplying}
                aria-label="Apply clipping"
                aria-busy={isApplying}
              >
                {isApplying ? (
                  <>
                    <span className="clipping-panel__spinner" aria-hidden="true" />
                    Applying...
                  </>
                ) : (
                  '✂️ Apply'
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default ClippingPanel;

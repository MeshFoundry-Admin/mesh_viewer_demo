import type { FC } from 'react';

export interface OverlayToggles {
  solid: boolean;
  smooth: boolean;
  wireframe: boolean;
  vertices: boolean;
  normals: boolean;
  bbox: boolean;
}

export interface OverlayPanelProps {
  overlays: OverlayToggles;
  onToggle: (key: keyof OverlayToggles) => void;
  disabled?: boolean;
}

interface OverlayOption {
  key: keyof OverlayToggles;
  label: string;
  description: string;
}

const OVERLAY_OPTIONS: OverlayOption[] = [
  { key: 'solid', label: 'Solid', description: 'Display face shading' },
  { key: 'smooth', label: 'Smooth', description: 'Smooth shading' },
  { key: 'wireframe', label: 'Wireframe', description: 'Display edges' },
  { key: 'vertices', label: 'Vertices', description: 'Display vertex points' },
  { key: 'normals', label: 'Normals', description: 'Display normal vectors' },
  { key: 'bbox', label: 'Bounding Box', description: 'Display AABB' }
];

export const OverlayPanel: FC<OverlayPanelProps> = ({
  overlays,
  onToggle,
  disabled = false
}) => {
  return (
    <section className="overlay-panel" aria-label="Overlay settings">
      <header>
        <h3>Overlays</h3>
      </header>
      <div className="overlay-options">
        {OVERLAY_OPTIONS.map((option) => (
          <label
            key={String(option.key)}
            className={`overlay-option ${overlays[option.key] ? 'active' : ''}`}
            title={option.description}
          >
            <input
              type="checkbox"
              checked={overlays[option.key]}
              onChange={() => onToggle(option.key)}
              disabled={disabled}
            />
            <span className="overlay-label">{option.label}</span>
          </label>
        ))}
      </div>
    </section>
  );
};

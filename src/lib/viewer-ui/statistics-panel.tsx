import { useMemo } from 'react';

export interface MeshStats {
  vertices: number;
  triangles: number;
  bbox: {
    min: [number, number, number];
    max: [number, number, number];
  };
  diagonalLength: number;
}

export interface StatisticsPanelProps {
  stats: MeshStats | null;
  updatedAt: number | null;
  className?: string;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatCoord(coords: [number, number, number]): string {
  return `(${coords.map((c) => c.toFixed(3)).join(', ')})`;
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString();
}

export function StatisticsPanel({
  stats,
  updatedAt,
  className = ''
}: StatisticsPanelProps) {
  const formattedStats = useMemo(() => {
    if (!stats) return null;
    return {
      vertices: formatNumber(stats.vertices),
      triangles: formatNumber(stats.triangles),
      bboxMin: formatCoord(stats.bbox.min),
      bboxMax: formatCoord(stats.bbox.max),
      diagonal: stats.diagonalLength.toFixed(3)
    };
  }, [stats]);

  if (!stats || !formattedStats) {
    return (
      <div
        className={`statistics-panel statistics-panel--empty ${className}`}
        data-testid="statistics-panel"
      >
        <div className="statistics-panel__header">
          <h3>Statistics</h3>
        </div>
        <div className="statistics-panel__content">
          <p className="statistics-panel__placeholder">
            Statistics will be displayed after loading a mesh
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`statistics-panel ${className}`}
      data-testid="statistics-panel"
    >
      <div className="statistics-panel__header">
        <h3>Statistics</h3>
        {updatedAt && (
          <span className="statistics-panel__timestamp">
            {formatTimestamp(updatedAt)}
          </span>
        )}
      </div>
      <div className="statistics-panel__content">
        <dl className="statistics-panel__list">
          <div className="statistics-panel__item">
            <dt>Vertices</dt>
            <dd data-testid="stat-vertices">{formattedStats.vertices}</dd>
          </div>
          <div className="statistics-panel__item">
            <dt>Triangles</dt>
            <dd data-testid="stat-triangles">{formattedStats.triangles}</dd>
          </div>
          <div className="statistics-panel__item">
            <dt>BBox Min</dt>
            <dd data-testid="stat-bbox-min">{formattedStats.bboxMin}</dd>
          </div>
          <div className="statistics-panel__item">
            <dt>BBox Max</dt>
            <dd data-testid="stat-bbox-max">{formattedStats.bboxMax}</dd>
          </div>
          <div className="statistics-panel__item">
            <dt>Diagonal Length</dt>
            <dd data-testid="stat-diagonal">{formattedStats.diagonal}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

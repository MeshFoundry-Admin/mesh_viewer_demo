import { useState, useCallback, useEffect } from 'react';

/**
 * DiagnosticLog type
 */
export interface DiagnosticLog {
  timestamp: number;
  category: 'core' | 'web_demo' | 'executor' | 'browser';
  op: string;
  status: 'ok' | 'warn' | 'error';
  elapsedMs?: number;
  details?: Record<string, string | number>;
}

/**
 * Browser metrics type
 */
export interface BrowserMetrics {
  userAgent: string;
  language: string;
  cookiesEnabled: boolean;
  onLine: boolean;
  memoryUsage?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
  timing?: {
    navigationStart: number;
    loadEventEnd: number;
    domContentLoadedEventEnd: number;
  };
}

// Log queue (max 20, FIFO)
const MAX_LOGS = 20;
let logQueue: DiagnosticLog[] = [];
let logListeners: Set<() => void> = new Set();

/**
 * Add log function (can be called externally)
 */
export function addDiagnosticLog(log: Omit<DiagnosticLog, 'timestamp'>): void {
  const fullLog: DiagnosticLog = {
    ...log,
    timestamp: Date.now(),
  };

  logQueue = [...logQueue, fullLog].slice(-MAX_LOGS);
  logListeners.forEach((listener) => listener());
}

/**
 * Clear log queue
 */
export function clearDiagnosticLogs(): void {
  logQueue = [];
  logListeners.forEach((listener) => listener());
}

/**
 * Get current logs
 */
export function getDiagnosticLogs(): DiagnosticLog[] {
  return [...logQueue];
}

/**
 * Collect browser metrics
 */
export function collectBrowserMetrics(): BrowserMetrics {
  const metrics: BrowserMetrics = {
    userAgent: navigator.userAgent,
    language: navigator.language,
    cookiesEnabled: navigator.cookieEnabled,
    onLine: navigator.onLine,
  };

  // Performance memory API (Chrome only)
  const perf = performance as Performance & {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  };

  if (perf.memory) {
    metrics.memoryUsage = {
      usedJSHeapSize: perf.memory.usedJSHeapSize,
      totalJSHeapSize: perf.memory.totalJSHeapSize,
      jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
    };
  }

  // Navigation timing
  const timing = performance.timing;
  if (timing && timing.navigationStart > 0) {
    metrics.timing = {
      navigationStart: timing.navigationStart,
      loadEventEnd: timing.loadEventEnd,
      domContentLoadedEventEnd: timing.domContentLoadedEventEnd,
    };
  }

  return metrics;
}

interface DiagnosticsPanelProps {
  className?: string;
  defaultExpanded?: boolean;
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const base = date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${base}.${ms}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function LogEntry({ log }: { log: DiagnosticLog }) {
  const statusClass =
    log.status === 'error'
      ? 'diagnostics-log--error'
      : log.status === 'warn'
      ? 'diagnostics-log--warn'
      : 'diagnostics-log--ok';

  return (
    <div className={`diagnostics-log ${statusClass}`} data-testid="diagnostic-log-entry">
      <span className="diagnostics-log__time">{formatTimestamp(log.timestamp)}</span>
      <span className="diagnostics-log__category">[{log.category}]</span>
      <span className="diagnostics-log__op">{log.op}</span>
      {log.elapsedMs !== undefined && (
        <span className="diagnostics-log__elapsed">{log.elapsedMs}ms</span>
      )}
      {log.status !== 'ok' && (
        <span className="diagnostics-log__status">{log.status.toUpperCase()}</span>
      )}
      {log.details && Object.keys(log.details).length > 0 && (
        <span className="diagnostics-log__details">
          {Object.entries(log.details)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')}
        </span>
      )}
    </div>
  );
}

function MetricsDisplay({ metrics }: { metrics: BrowserMetrics }) {
  return (
    <div className="diagnostics-metrics" data-testid="browser-metrics">
      <div className="diagnostics-metrics__item">
        <span className="diagnostics-metrics__label">Online:</span>
        <span className="diagnostics-metrics__value">
          {metrics.onLine ? '✓' : '✗'}
        </span>
      </div>
      <div className="diagnostics-metrics__item">
        <span className="diagnostics-metrics__label">Language:</span>
        <span className="diagnostics-metrics__value">{metrics.language}</span>
      </div>
      {metrics.memoryUsage && (
        <>
          <div className="diagnostics-metrics__item">
            <span className="diagnostics-metrics__label">JS Heap Usage:</span>
            <span className="diagnostics-metrics__value">
              {formatBytes(metrics.memoryUsage.usedJSHeapSize)} /{' '}
              {formatBytes(metrics.memoryUsage.totalJSHeapSize)}
            </span>
          </div>
          <div className="diagnostics-metrics__item">
            <span className="diagnostics-metrics__label">Heap Limit:</span>
            <span className="diagnostics-metrics__value">
              {formatBytes(metrics.memoryUsage.jsHeapSizeLimit)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export function DiagnosticsPanel({
  className = '',
  defaultExpanded = false,
}: DiagnosticsPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [logs, setLogs] = useState<DiagnosticLog[]>(getDiagnosticLogs);
  const [metrics, setMetrics] = useState<BrowserMetrics>(collectBrowserMetrics);

  // Log update listener
  useEffect(() => {
    const updateLogs = () => setLogs(getDiagnosticLogs());
    logListeners.add(updateLogs);
    return () => {
      logListeners.delete(updateLogs);
    };
  }, []);

  // Periodic metrics update
  useEffect(() => {
    if (!expanded) return;

    const interval = setInterval(() => {
      setMetrics(collectBrowserMetrics());
    }, 2000);

    return () => clearInterval(interval);
  }, [expanded]);

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleClear = useCallback(() => {
    clearDiagnosticLogs();
  }, []);

  return (
    <div
      className={`diagnostics-panel ${expanded ? 'diagnostics-panel--expanded' : ''} ${className}`}
      data-testid="diagnostics-panel"
    >
      <div className="diagnostics-panel__header" onClick={handleToggle}>
        <h3>Diagnostic Logs</h3>
        <span className="diagnostics-panel__toggle">
          {expanded ? '▼' : '▶'}
        </span>
        <span className="diagnostics-panel__count">{logs.length} entries</span>
      </div>

      {expanded && (
        <div className="diagnostics-panel__content">
          <div className="diagnostics-panel__actions">
            <button
              type="button"
              onClick={handleClear}
              className="diagnostics-panel__clear-btn"
            >
              Clear Logs
            </button>
          </div>

          <div className="diagnostics-panel__section">
            <h4>Browser Metrics</h4>
            <MetricsDisplay metrics={metrics} />
          </div>

          <div className="diagnostics-panel__section">
            <h4>Recent Logs ({logs.length}/{MAX_LOGS})</h4>
            <div className="diagnostics-panel__logs">
              {logs.length === 0 ? (
                <p className="diagnostics-panel__empty">No logs available</p>
              ) : (
                logs.map((log, idx) => <LogEntry key={idx} log={log} />)
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

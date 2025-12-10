/**
 * Metrics Recorder
 * Collects load time, memory estimation, and fallback count
 */

export interface PerformanceSample {
  assetId: string;
  loadDurationMs: number;
  fpsAverage: number | null;
  memoryEstimateMb: number | null;
  fallbackCount: number;
  timestamp: number;
}

export interface LoadMetrics {
  assetId: string;
  fileName: string;
  fileSizeBytes: number;
  loadStartMs: number;
  loadEndMs: number;
  parseStartMs: number;
  parseEndMs: number;
  fallbackUsed: boolean;
  format: string;
}

export interface MemoryGuardConfig {
  maxHeapMb: number;
  warningThresholdPercent: number;
  criticalThresholdPercent: number;
}

export interface MemoryStatus {
  usedMb: number;
  totalMb: number;
  limitMb: number;
  usagePercent: number;
  level: 'ok' | 'warning' | 'critical';
}

// Default memory guard configuration
const DEFAULT_MEMORY_GUARD: MemoryGuardConfig = {
  maxHeapMb: 512,
  warningThresholdPercent: 70,
  criticalThresholdPercent: 90,
};

// Metrics storage
let performanceSamples: PerformanceSample[] = [];
let fallbackCount = 0;
let memoryGuardConfig = { ...DEFAULT_MEMORY_GUARD };
let metricsListeners: Set<() => void> = new Set();

/**
 * Register a metrics listener
 */
export function subscribeToMetrics(listener: () => void): () => void {
  metricsListeners.add(listener);
  return () => metricsListeners.delete(listener);
}

/**
 * Notify all listeners
 */
function notifyListeners(): void {
  metricsListeners.forEach((listener) => listener());
}

/**
 * Record load metrics
 */
export function recordLoadMetrics(metrics: LoadMetrics): PerformanceSample {
  const loadDurationMs = metrics.loadEndMs - metrics.loadStartMs;
  const parseDurationMs = metrics.parseEndMs - metrics.parseStartMs;

  if (metrics.fallbackUsed) {
    fallbackCount++;
  }

  const memoryStatus = getMemoryStatus();

  const sample: PerformanceSample = {
    assetId: metrics.assetId,
    loadDurationMs,
    fpsAverage: null, // FPS is collected separately
    memoryEstimateMb: memoryStatus?.usedMb ?? null,
    fallbackCount,
    timestamp: Date.now(),
  };

  performanceSamples.push(sample);

  // Keep maximum 100 samples
  if (performanceSamples.length > 100) {
    performanceSamples = performanceSamples.slice(-100);
  }

  notifyListeners();

  return sample;
}

/**
 * Create an FPS counter
 */
export function createFpsCounter(): {
  tick: () => void;
  getAverage: () => number;
  reset: () => void;
} {
  let frameCount = 0;
  let lastTime = performance.now();
  let fps = 0;
  let fpsHistory: number[] = [];

  return {
    tick: () => {
      frameCount++;
      const currentTime = performance.now();
      const elapsed = currentTime - lastTime;

      if (elapsed >= 1000) {
        fps = (frameCount / elapsed) * 1000;
        fpsHistory.push(fps);

        // Keep last 30 seconds
        if (fpsHistory.length > 30) {
          fpsHistory = fpsHistory.slice(-30);
        }

        frameCount = 0;
        lastTime = currentTime;
      }
    },
    getAverage: () => {
      if (fpsHistory.length === 0) return 0;
      return fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length;
    },
    reset: () => {
      frameCount = 0;
      lastTime = performance.now();
      fps = 0;
      fpsHistory = [];
    },
  };
}

/**
 * Get memory status
 */
export function getMemoryStatus(): MemoryStatus | null {
  const perf = performance as Performance & {
    memory?: {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    };
  };

  if (!perf.memory) {
    return null;
  }

  const usedMb = perf.memory.usedJSHeapSize / (1024 * 1024);
  const totalMb = perf.memory.totalJSHeapSize / (1024 * 1024);
  const limitMb = perf.memory.jsHeapSizeLimit / (1024 * 1024);
  const usagePercent = (usedMb / limitMb) * 100;

  let level: MemoryStatus['level'] = 'ok';
  if (usagePercent >= memoryGuardConfig.criticalThresholdPercent) {
    level = 'critical';
  } else if (usagePercent >= memoryGuardConfig.warningThresholdPercent) {
    level = 'warning';
  }

  return {
    usedMb,
    totalMb,
    limitMb,
    usagePercent,
    level,
  };
}

/**
 * Check memory guard
 * Returns true if memory usage exceeds threshold
 */
export function checkMemoryGuard(): {
  canProceed: boolean;
  status: MemoryStatus | null;
  message?: string;
} {
  const status = getMemoryStatus();

  if (!status) {
    // Allow proceeding when Memory API is not supported
    return { canProceed: true, status: null };
  }

  if (status.level === 'critical') {
    return {
      canProceed: false,
      status,
      message: `Memory usage is at ${status.usagePercent.toFixed(1)}%. Please release existing meshes before loading new ones.`,
    };
  }

  if (status.level === 'warning') {
    return {
      canProceed: true,
      status,
      message: `Memory usage is at ${status.usagePercent.toFixed(1)}%. Be cautious when loading large meshes.`,
    };
  }

  return { canProceed: true, status };
}

/**
 * Update memory guard configuration
 */
export function setMemoryGuardConfig(config: Partial<MemoryGuardConfig>): void {
  memoryGuardConfig = { ...memoryGuardConfig, ...config };
}

/**
 * Get fallback count
 */
export function getFallbackCount(): number {
  return fallbackCount;
}

/**
 * Increment fallback count
 */
export function incrementFallbackCount(): void {
  fallbackCount++;
  notifyListeners();
}

/**
 * Get performance samples
 */
export function getPerformanceSamples(): PerformanceSample[] {
  return [...performanceSamples];
}

/**
 * Get the latest performance sample
 */
export function getLatestSample(): PerformanceSample | null {
  return performanceSamples.length > 0
    ? performanceSamples[performanceSamples.length - 1]
    : null;
}

/**
 * Get samples for a specific asset
 */
export function getSamplesForAsset(assetId: string): PerformanceSample[] {
  return performanceSamples.filter((s) => s.assetId === assetId);
}

/**
 * Calculate average load time
 */
export function getAverageLoadTime(): number {
  if (performanceSamples.length === 0) return 0;
  const total = performanceSamples.reduce((sum, s) => sum + s.loadDurationMs, 0);
  return total / performanceSamples.length;
}

/**
 * Reset metrics
 */
export function resetMetrics(): void {
  performanceSamples = [];
  fallbackCount = 0;
  notifyListeners();
}

/**
 * Generate metrics summary
 */
export function generateMetricsSummary(): {
  totalLoads: number;
  averageLoadTimeMs: number;
  fallbackCount: number;
  currentMemory: MemoryStatus | null;
  lastLoadTimestamp: number | null;
} {
  return {
    totalLoads: performanceSamples.length,
    averageLoadTimeMs: getAverageLoadTime(),
    fallbackCount,
    currentMemory: getMemoryStatus(),
    lastLoadTimestamp:
      performanceSamples.length > 0
        ? performanceSamples[performanceSamples.length - 1].timestamp
        : null,
  };
}

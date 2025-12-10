import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  detectStorageCapabilities,
  selectStorageDriver,
  createPersistenceAdapter,
  type PersistenceAdapter,
} from '../persistence';
import {
  recordLoadMetrics,
  getMemoryStatus,
  checkMemoryGuard,
  getFallbackCount,
  getPerformanceSamples,
  getAverageLoadTime,
  resetMetrics,
  generateMetricsSummary,
  createFpsCounter,
  type LoadMetrics,
} from '../metrics-recorder';

describe('persistence', () => {
  describe('detectStorageCapabilities', () => {
    it('detects browser storage capabilities', () => {
      const capabilities = detectStorageCapabilities();

      expect(capabilities).toHaveProperty('indexedDB');
      expect(capabilities).toHaveProperty('localStorage');
      expect(capabilities).toHaveProperty('sessionStorage');
      expect(capabilities).toHaveProperty('quota');

      // localStorage is supported in jsdom environment
      expect(typeof capabilities.localStorage).toBe('boolean');
    });
  });

  describe('selectStorageDriver', () => {
    it('selects the best available driver', () => {
      const driver = selectStorageDriver();

      // In jsdom environment, either indexeddb or localstorage
      expect(['indexeddb', 'localstorage', 'none']).toContain(driver);
    });
  });

  describe('createPersistenceAdapter', () => {
    let adapter: PersistenceAdapter;

    beforeEach(() => {
      adapter = createPersistenceAdapter();
    });

    afterEach(async () => {
      await adapter.clear();
    });

    it('has a driver property', () => {
      expect(['indexeddb', 'localstorage', 'none']).toContain(adapter.driver);
    });

    it('can store and retrieve values', async () => {
      const testData = { key: 'value', number: 42 };

      await adapter.set('test-key', testData);
      const result = await adapter.get<typeof testData>('test-key');

      expect(result).toEqual(testData);
    });

    it('returns null for non-existent keys', async () => {
      const result = await adapter.get('non-existent-key');

      expect(result).toBeNull();
    });

    it('can delete values', async () => {
      await adapter.set('delete-test', 'value');
      await adapter.remove('delete-test');
      const result = await adapter.get('delete-test');

      expect(result).toBeNull();
    });

    it('can clear all values', async () => {
      await adapter.set('key1', 'value1');
      await adapter.set('key2', 'value2');
      await adapter.clear();

      const keys = await adapter.keys();
      expect(keys).toHaveLength(0);
    });

    it('returns the list of stored keys', async () => {
      await adapter.set('list-key-1', 'v1');
      await adapter.set('list-key-2', 'v2');

      const keys = await adapter.keys();

      expect(keys).toContain('list-key-1');
      expect(keys).toContain('list-key-2');
    });
  });
});

describe('metrics-recorder', () => {
  beforeEach(() => {
    resetMetrics();
  });

  describe('recordLoadMetrics', () => {
    it('records load metrics and returns a sample', () => {
      const metrics: LoadMetrics = {
        assetId: 'test-asset-1',
        fileName: 'test.stl',
        fileSizeBytes: 1024,
        loadStartMs: 1000,
        loadEndMs: 1500,
        parseStartMs: 1100,
        parseEndMs: 1400,
        fallbackUsed: false,
        format: 'stl',
      };

      const sample = recordLoadMetrics(metrics);

      expect(sample.assetId).toBe('test-asset-1');
      expect(sample.loadDurationMs).toBe(500);
      expect(sample.fallbackCount).toBe(0);
      expect(sample.timestamp).toBeGreaterThan(0);
    });

    it('increments the count when fallback is used', () => {
      const metricsWithFallback: LoadMetrics = {
        assetId: 'test-asset-2',
        fileName: 'test.obj',
        fileSizeBytes: 2048,
        loadStartMs: 1000,
        loadEndMs: 2000,
        parseStartMs: 1100,
        parseEndMs: 1900,
        fallbackUsed: true,
        format: 'obj',
      };

      recordLoadMetrics(metricsWithFallback);

      expect(getFallbackCount()).toBe(1);
    });
  });

  describe('getPerformanceSamples', () => {
    it('returns all recorded samples', () => {
      const metrics1: LoadMetrics = {
        assetId: 'asset-1',
        fileName: 'a.stl',
        fileSizeBytes: 100,
        loadStartMs: 0,
        loadEndMs: 100,
        parseStartMs: 10,
        parseEndMs: 90,
        fallbackUsed: false,
        format: 'stl',
      };

      const metrics2: LoadMetrics = {
        assetId: 'asset-2',
        fileName: 'b.obj',
        fileSizeBytes: 200,
        loadStartMs: 0,
        loadEndMs: 200,
        parseStartMs: 20,
        parseEndMs: 180,
        fallbackUsed: false,
        format: 'obj',
      };

      recordLoadMetrics(metrics1);
      recordLoadMetrics(metrics2);

      const samples = getPerformanceSamples();

      expect(samples).toHaveLength(2);
      expect(samples[0].assetId).toBe('asset-1');
      expect(samples[1].assetId).toBe('asset-2');
    });
  });

  describe('getAverageLoadTime', () => {
    it('calculates the average load time', () => {
      recordLoadMetrics({
        assetId: 'a1',
        fileName: 'a.stl',
        fileSizeBytes: 100,
        loadStartMs: 0,
        loadEndMs: 100,
        parseStartMs: 0,
        parseEndMs: 100,
        fallbackUsed: false,
        format: 'stl',
      });

      recordLoadMetrics({
        assetId: 'a2',
        fileName: 'b.stl',
        fileSizeBytes: 100,
        loadStartMs: 0,
        loadEndMs: 300,
        parseStartMs: 0,
        parseEndMs: 300,
        fallbackUsed: false,
        format: 'stl',
      });

      const avgTime = getAverageLoadTime();

      expect(avgTime).toBe(200); // (100 + 300) / 2
    });

    it('returns 0 when there are no samples', () => {
      expect(getAverageLoadTime()).toBe(0);
    });
  });

  describe('generateMetricsSummary', () => {
    it('generates a metrics summary', () => {
      recordLoadMetrics({
        assetId: 'sum-1',
        fileName: 'test.stl',
        fileSizeBytes: 500,
        loadStartMs: 0,
        loadEndMs: 150,
        parseStartMs: 10,
        parseEndMs: 140,
        fallbackUsed: true,
        format: 'stl',
      });

      const summary = generateMetricsSummary();

      expect(summary.totalLoads).toBe(1);
      expect(summary.averageLoadTimeMs).toBe(150);
      expect(summary.fallbackCount).toBe(1);
      expect(summary.lastLoadTimestamp).toBeGreaterThan(0);
    });
  });

  describe('checkMemoryGuard', () => {
    it('checks memory status and returns whether to proceed', () => {
      const result = checkMemoryGuard();

      expect(result).toHaveProperty('canProceed');
      expect(result).toHaveProperty('status');

      // In jsdom, memory API is not available so status may be null
      if (result.status === null) {
        expect(result.canProceed).toBe(true);
      }
    });
  });

  describe('createFpsCounter', () => {
    it('creates an FPS counter', () => {
      const counter = createFpsCounter();

      expect(counter.tick).toBeDefined();
      expect(counter.getAverage).toBeDefined();
      expect(counter.reset).toBeDefined();
    });

    it('initial average is 0', () => {
      const counter = createFpsCounter();

      expect(counter.getAverage()).toBe(0);
    });

    it('average resets to 0 after reset', () => {
      const counter = createFpsCounter();
      counter.tick();
      counter.reset();

      expect(counter.getAverage()).toBe(0);
    });
  });

  describe('resetMetrics', () => {
    it('resets all metrics', () => {
      recordLoadMetrics({
        assetId: 'reset-test',
        fileName: 'test.stl',
        fileSizeBytes: 100,
        loadStartMs: 0,
        loadEndMs: 100,
        parseStartMs: 0,
        parseEndMs: 100,
        fallbackUsed: true,
        format: 'stl',
      });

      resetMetrics();

      expect(getPerformanceSamples()).toHaveLength(0);
      expect(getFallbackCount()).toBe(0);
    });
  });
});

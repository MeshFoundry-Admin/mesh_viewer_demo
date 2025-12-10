/**
 * Persistence Adapter
 * Persistence layer with IndexedDB priority and localStorage fallback
 */

export type StorageDriver = 'indexeddb' | 'localstorage' | 'none';

export interface StorageCapabilities {
  indexedDB: boolean;
  localStorage: boolean;
  sessionStorage: boolean;
  quota: number | null;
}

export interface PersistenceAdapter {
  driver: StorageDriver;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}

const DB_NAME = 'mesh-viewer-demo-db';
const STORE_NAME = 'persistence';
const DB_VERSION = 1;

/**
 * Detect storage capabilities
 */
export function detectStorageCapabilities(): StorageCapabilities {
  const capabilities: StorageCapabilities = {
    indexedDB: false,
    localStorage: false,
    sessionStorage: false,
    quota: null,
  };

  // Check IndexedDB availability
  try {
    capabilities.indexedDB = typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    capabilities.indexedDB = false;
  }

  // Check localStorage availability
  try {
    if (typeof localStorage !== 'undefined') {
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      capabilities.localStorage = true;
    }
  } catch {
    capabilities.localStorage = false;
  }

  // Check sessionStorage availability
  try {
    if (typeof sessionStorage !== 'undefined') {
      const testKey = '__storage_test__';
      sessionStorage.setItem(testKey, testKey);
      sessionStorage.removeItem(testKey);
      capabilities.sessionStorage = true;
    }
  } catch {
    capabilities.sessionStorage = false;
  }

  // Estimate storage quota (Storage API)
  if (typeof navigator !== 'undefined' && 'storage' in navigator) {
    navigator.storage.estimate().then((estimate) => {
      capabilities.quota = estimate.quota ?? null;
    }).catch(() => {
      capabilities.quota = null;
    });
  }

  return capabilities;
}

/**
 * Select optimal storage driver
 */
export function selectStorageDriver(): StorageDriver {
  const capabilities = detectStorageCapabilities();

  if (capabilities.indexedDB) {
    return 'indexeddb';
  }
  if (capabilities.localStorage) {
    return 'localstorage';
  }
  return 'none';
}

/**
 * IndexedDB Helper
 */
class IndexedDBHelper {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private openDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        this.dbPromise = null;
        reject(new Error(`IndexedDB open failed: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });

    return this.dbPromise;
  }

  async get<T>(key: string): Promise<T | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result !== undefined ? result : null);
      };
    });
  }

  async set<T>(key: string, value: T): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async remove(key: string): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clear(): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async keys(): Promise<string[]> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAllKeys();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(request.result.map((k) => String(k)));
      };
    });
  }
}

/**
 * localStorage Adapter
 */
class LocalStorageAdapter implements PersistenceAdapter {
  readonly driver: StorageDriver = 'localstorage';
  private prefix = 'mesh-viewer-demo:';

  async get<T>(key: string): Promise<T | null> {
    const item = localStorage.getItem(this.prefix + key);
    if (item === null) return null;
    try {
      return JSON.parse(item) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    localStorage.setItem(this.prefix + key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(this.prefix + key);
  }

  async clear(): Promise<void> {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  }

  async keys(): Promise<string[]> {
    const result: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        result.push(key.slice(this.prefix.length));
      }
    }
    return result;
  }
}

/**
 * IndexedDB Adapter
 */
class IndexedDBAdapter implements PersistenceAdapter {
  readonly driver: StorageDriver = 'indexeddb';
  private helper = new IndexedDBHelper();

  async get<T>(key: string): Promise<T | null> {
    return this.helper.get<T>(key);
  }

  async set<T>(key: string, value: T): Promise<void> {
    return this.helper.set(key, value);
  }

  async remove(key: string): Promise<void> {
    return this.helper.remove(key);
  }

  async clear(): Promise<void> {
    return this.helper.clear();
  }

  async keys(): Promise<string[]> {
    return this.helper.keys();
  }
}

/**
 * No-op Adapter (for environments without storage support)
 */
class NoopAdapter implements PersistenceAdapter {
  readonly driver: StorageDriver = 'none';

  async get<T>(): Promise<T | null> {
    return null;
  }

  async set<T>(): Promise<void> {
    // no-op
  }

  async remove(): Promise<void> {
    // no-op
  }

  async clear(): Promise<void> {
    // no-op
  }

  async keys(): Promise<string[]> {
    return [];
  }
}

/**
 * Fallback Adapter with IndexedDB priority and localStorage fallback
 */
class FallbackAdapter implements PersistenceAdapter {
  private primary: PersistenceAdapter;
  private fallback: PersistenceAdapter;

  get driver(): StorageDriver {
    return this.primary.driver;
  }

  constructor(primary: PersistenceAdapter, fallback: PersistenceAdapter) {
    this.primary = primary;
    this.fallback = fallback;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      return await this.primary.get<T>(key);
    } catch {
      return this.fallback.get<T>(key);
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await this.primary.set(key, value);
    } catch {
      await this.fallback.set(key, value);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.primary.remove(key);
    } catch {
      await this.fallback.remove(key);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.primary.clear();
    } catch {
      await this.fallback.clear();
    }
  }

  async keys(): Promise<string[]> {
    try {
      return await this.primary.keys();
    } catch {
      return this.fallback.keys();
    }
  }
}

/**
 * Persistence Adapter Factory
 */
export function createPersistenceAdapter(): PersistenceAdapter {
  const capabilities = detectStorageCapabilities();

  if (capabilities.indexedDB && capabilities.localStorage) {
    // IndexedDB priority with localStorage fallback
    return new FallbackAdapter(new IndexedDBAdapter(), new LocalStorageAdapter());
  }

  if (capabilities.indexedDB) {
    return new IndexedDBAdapter();
  }

  if (capabilities.localStorage) {
    return new LocalStorageAdapter();
  }

  return new NoopAdapter();
}

// Singleton instance
let persistenceInstance: PersistenceAdapter | null = null;

/**
 * Get global Persistence Adapter instance
 */
export function getPersistenceAdapter(): PersistenceAdapter {
  if (!persistenceInstance) {
    persistenceInstance = createPersistenceAdapter();
  }
  return persistenceInstance;
}

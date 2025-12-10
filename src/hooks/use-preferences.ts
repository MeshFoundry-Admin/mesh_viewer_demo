import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

/**
 * PreferenceProfile schema
 */
export interface PreferenceProfile {
  version: number;
  defaultShading: 'solid' | 'wireframe' | 'smooth';
  backgroundColor: string;
  fitToView: boolean;
  overlays: {
    solid: boolean;
    smooth: boolean;
    wireframe: boolean;
    vertices: boolean;
    normals: boolean;
    bbox: boolean;
  };
  storageTs: number;
  storageDriver: 'indexeddb' | 'localstorage';
}

/**
 * PreferenceStore actions
 */
export interface PreferenceActions {
  setDefaultShading: (shading: PreferenceProfile['defaultShading']) => void;
  setBackgroundColor: (color: string) => void;
  setFitToView: (enabled: boolean) => void;
  setOverlay: (key: keyof PreferenceProfile['overlays'], value: boolean) => void;
  resetToDefaults: () => void;
}

export type PreferenceStore = PreferenceProfile & PreferenceActions;

/**
 * Default preference values
 */
export const DEFAULT_PREFERENCES: PreferenceProfile = {
  version: 1,
  defaultShading: 'solid',
  backgroundColor: '#1a1a2e',
  fitToView: true,
  overlays: {
    solid: true,
    smooth: false,
    wireframe: false,
    vertices: false,
    normals: false,
    bbox: false,
  },
  storageTs: 0,
  storageDriver: 'localstorage',
};

/**
 * IndexedDB-first storage with localStorage fallback
 */
const createPreferenceStorage = (): StateStorage => {
  // Check IndexedDB availability
  const hasIndexedDB = typeof indexedDB !== 'undefined';
  
  if (hasIndexedDB) {
    return {
      getItem: async (name: string): Promise<string | null> => {
        try {
          return await getFromIndexedDB(name);
        } catch {
          // Fallback to localStorage on IndexedDB failure
          return localStorage.getItem(name);
        }
      },
      setItem: async (name: string, value: string): Promise<void> => {
        try {
          await setToIndexedDB(name, value);
        } catch {
          // Fallback to localStorage on IndexedDB failure
          localStorage.setItem(name, value);
        }
      },
      removeItem: async (name: string): Promise<void> => {
        try {
          await removeFromIndexedDB(name);
        } catch {
          localStorage.removeItem(name);
        }
      },
    };
  }

  // Use localStorage when IndexedDB is not supported
  return {
    getItem: (name: string) => localStorage.getItem(name),
    setItem: (name: string, value: string) => localStorage.setItem(name, value),
    removeItem: (name: string) => localStorage.removeItem(name),
  };
};

// IndexedDB helper functions
const DB_NAME = 'mesh-viewer-demo-preferences';
const STORE_NAME = 'preferences';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function getFromIndexedDB(key: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result ?? null);
    
    transaction.oncomplete = () => db.close();
  });
}

async function setToIndexedDB(key: string, value: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(value, key);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    
    transaction.oncomplete = () => db.close();
  });
}

async function removeFromIndexedDB(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(key);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
    
    transaction.oncomplete = () => db.close();
  });
}

/**
 * Detect storage driver
 */
function detectStorageDriver(): PreferenceProfile['storageDriver'] {
  if (typeof indexedDB !== 'undefined') {
    return 'indexeddb';
  }
  return 'localstorage';
}

/**
 * Preference Store (zustand/persist)
 */
export const usePreferences = create<PreferenceStore>()(
  persist(
    (set) => ({
      ...DEFAULT_PREFERENCES,
      storageDriver: detectStorageDriver(),

      setDefaultShading: (shading) =>
        set({
          defaultShading: shading,
          storageTs: Date.now(),
        }),

      setBackgroundColor: (color) =>
        set({
          backgroundColor: color,
          storageTs: Date.now(),
        }),

      setFitToView: (enabled) =>
        set({
          fitToView: enabled,
          storageTs: Date.now(),
        }),

      setOverlay: (key, value) =>
        set((state) => ({
          overlays: {
            ...state.overlays,
            [key]: value,
          },
          storageTs: Date.now(),
        })),

      resetToDefaults: () =>
        set({
          ...DEFAULT_PREFERENCES,
          storageTs: Date.now(),
          storageDriver: detectStorageDriver(),
        }),
    }),
    {
      name: 'mesh-viewer-demo-preferences',
      storage: createJSONStorage(createPreferenceStorage),
      partialize: (state) => ({
        version: state.version,
        defaultShading: state.defaultShading,
        backgroundColor: state.backgroundColor,
        fitToView: state.fitToView,
        overlays: state.overlays,
        storageTs: state.storageTs,
        storageDriver: state.storageDriver,
      }),
    }
  )
);

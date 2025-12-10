/**
 * Vitest test environment setup
 */
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// WASM module mock
vi.mock('@/lib/mesh-core-adapter', () => ({
  createMeshLoader: vi.fn(),
  initCore: vi.fn().mockResolvedValue({ isInitialized: true }),
  MeshLoader: vi.fn(),
  calculateMeshStats: vi.fn()
}));

// WebGL context mock
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  drawArrays: vi.fn(),
  createShader: vi.fn(),
  shaderSource: vi.fn(),
  compileShader: vi.fn(),
  getShaderParameter: vi.fn(() => true),
  createProgram: vi.fn(),
  attachShader: vi.fn(),
  linkProgram: vi.fn(),
  getProgramParameter: vi.fn(() => true),
  useProgram: vi.fn(),
  clearColor: vi.fn(),
  clear: vi.fn(),
  viewport: vi.fn(),
  enable: vi.fn(),
  depthFunc: vi.fn()
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// ResizeObserver mock
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}));

// matchMedia mock
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
});

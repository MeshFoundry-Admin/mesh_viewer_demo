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
  canvas: {},
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
  depthFunc: vi.fn(),
  createBuffer: vi.fn(),
  bindBuffer: vi.fn(),
  bufferData: vi.fn(),
  enableVertexAttribArray: vi.fn(),
  vertexAttribPointer: vi.fn(),
  getExtension: vi.fn(),
  getParameter: vi.fn(() => 'WebGL 1.0'),
  getShaderPrecisionFormat: vi.fn(() => ({ precision: 23, rangeMin: 127, rangeMax: 127 })),
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  getImageData: vi.fn(() => ({ data: new Array(4) })),
  putImageData: vi.fn(),
  createImageData: vi.fn(() => []),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  fillText: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  stroke: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  transform: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn()
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// ResizeObserver mock
(globalThis as any).ResizeObserver = vi.fn().mockImplementation(() => ({
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

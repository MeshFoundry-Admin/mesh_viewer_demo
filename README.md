# 🔬 Mesh Viewer Demo

<div align="center">

![React](https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react)
![Three.js](https://img.shields.io/badge/Three.js-0.166-black?style=flat-square&logo=three.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=flat-square&logo=typescript)
![WebAssembly](https://img.shields.io/badge/WebAssembly-Enabled-654FF0?style=flat-square&logo=webassembly)
![Vite](https://img.shields.io/badge/Vite-5.2-646CFF?style=flat-square&logo=vite)

**High-Performance WebGL-based 3D Mesh Viewer · STL/OBJ/PLY Support · Real-time Clipping**

[Live Demo](#demo) · [Features](#-features) · [Technical Details](#-technical-details) · [Getting Started](#-getting-started)

</div>

---

## 📋 Project Overview

**Mesh Viewer Demo** is a professional viewer application that enables fast loading and analysis of large 3D mesh files directly in the web browser. Through a hybrid WebAssembly and JavaScript parsing architecture, it efficiently handles meshes up to 600MB with 30 million triangles.

### 🎯 Problems Solved

- **Large Mesh Loading Bottleneck**: WASM + JS hybrid parsing selects optimal path per format
- **Browser Memory Limitations**: Zero-copy buffer management with direct TypedArray references
- **Real-time Interaction**: GPU-accelerated clipping and TrackballControls camera

---

## ✨ Features

### 🗂️ Multi-Format Support
| Format | ASCII | Binary | Notes |
|--------|:-----:|:------:|-------|
| **STL** | ✅ | ✅ | Auto-detection |
| **OBJ** | ✅ | - | Wavefront standard |
| **PLY** | ✅ | ✅ (LE/BE) | Stanford format |

### ✂️ Real-time Clipping System
- **Axis-Aligned Clipping**: Slider control for X/Y/Z axes
- **Free Plane Clipping**: Rotation/translation via 3D gizmo
- **GPU Acceleration**: Leveraging Three.js `clippingPlanes` API

### 🎨 Rendering Overlays
- **Solid/Smooth Shading**: Flat/Smooth normal toggle
- **Wireframe**: GPU-based immediate rendering
- **Vertex Points**: Vertex visualization
- **Normals**: Normal vector debugging
- **Bounding Box**: AABB display

### 📊 Mesh Analysis
- Vertex/Triangle count
- Bounding box dimensions
- File size and format information
- Load time metrics

---

## 🏗️ Technical Details

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     React UI Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ FileDropzone │  │ClippingPanel │  │ StatisticsPanel│    │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                  Zustand State Store                         │
│         (ViewerState, Overlays, Clipping, Camera)           │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                 MeshCoreAdapter Layer                        │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │   Format Detector   │  │   Metrics Collector  │          │
│  └──────────┬──────────┘  └─────────────────────┘          │
│             │                                                │
│  ┌──────────▼──────────────────────────────────────────┐   │
│  │           Hybrid Parser Router                       │   │
│  │  ┌─────────────────┐    ┌─────────────────────┐     │   │
│  │  │  JS Parsers     │    │  WASM Bridge        │     │   │
│  │  │  (ASCII formats)│    │  (Binary formats)   │     │   │
│  │  │  - PLY ASCII    │    │  - Binary PLY       │     │   │
│  │  │  - STL ASCII    │    │  - Binary STL       │     │   │
│  │  │  - OBJ          │    │                     │     │   │
│  │  └─────────────────┘    └─────────────────────┘     │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                 Three.js Render Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ BufferGeometry│ │ MeshMaterial │  │ClippingPlanes│      │
│  │ (Zero-copy)  │  │ (GPU Shader) │  │ (GPU Accel)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### Core Technology Stack

| Area | Technology | Rationale |
|------|------------|-----------|
| **UI Framework** | React 18 | Concurrent rendering, Suspense support |
| **3D Rendering** | Three.js + R3F | Declarative 3D components, WebGL abstraction |
| **State** | Zustand | Lightweight, TypeScript-friendly, minimal boilerplate |
| **Parser (ASCII)** | JavaScript | V8 JIT optimization, efficient string processing |
| **Parser (Binary)** | WebAssembly | Byte manipulation performance, memory control |
| **Build** | Vite | ESM-based HMR, fast cold start |
| **Testing** | Vitest + Playwright | Integrated unit/E2E testing |

### Performance Optimizations

#### 1. Hybrid Parsing Strategy
```typescript
// ASCII formats: JS parser (leveraging V8 string optimization)
if (format === 'ply_ascii' || format === 'stl' || format === 'obj') {
  return parseWithJavaScript(buffer);
}
// Binary formats: WASM (efficient byte manipulation)
return bridge.parseMesh(buffer, format);
```

#### 2. Zero-Copy Buffer Management
```typescript
// Create TypedArray view directly from WASM heap
const vertexView = new Float64Array(
  bridge.memory.buffer,
  vertexPtr,
  vertexCount * 3
);
```

#### 3. GPU Clipping
```typescript
// Shader-level clipping (no CPU mesh regeneration needed)
material.clippingPlanes = [computeClippingPlane(state, bbox)];
```

### File Size Limits

| Limit | Value | Notes |
|-------|-------|-------|
| Max File Size | 600 MB | `E_FILE_TOO_LARGE` error |
| Max Triangles | 30 million | `E_TOO_MANY_TRIANGULAR` error |

---

## 🚀 Getting Started

### Requirements

- Node.js 18+ 
- pnpm (recommended) or npm

### Installation

```bash
# Clone repository
git clone https://github.com/your-username/mesh-viewer-demo.git
cd mesh-viewer-demo

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

Open http://localhost:4200 in your browser

### Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Vite dev server (HMR) |
| `pnpm build` | TypeScript compile + production build |
| `pnpm preview` | Preview production build |
| `pnpm test` | Vitest unit tests |
| `pnpm test:ui` | Vitest UI mode |
| `pnpm test:e2e` | Playwright E2E tests |
| `pnpm lint` | ESLint check |

---

## 📁 Project Structure

```
mesh-viewer-demo/
├── src/
│   ├── app/                    # App entry point
│   ├── components/             # UI components
│   │   ├── file-dropzone.tsx   # File drag & drop
│   │   ├── clipping-plane-helper.tsx
│   │   └── plane-gizmo.tsx     # 3D gizmo
│   ├── hooks/
│   │   └── use-viewer-state.ts # Zustand store
│   ├── lib/
│   │   ├── mesh-core-adapter/  # Mesh loading adapter
│   │   │   ├── adapter.ts      # Single entry point
│   │   │   ├── js-parsers.ts   # JS parsers (ASCII)
│   │   │   ├── wasm-loader.ts  # WASM bridge
│   │   │   └── contracts/      # JSON Schema
│   │   └── viewer-ui/          # Viewer UI panels
│   ├── scenes/
│   │   └── mesh-viewer.tsx     # Three.js scene
│   └── utils/
│       └── clipping.ts         # Clipping utilities
├── public/core/                # WASM module
├── tests/                      # E2E tests
└── package.json
```

---

## 🧪 Testing

### Unit Tests (Vitest)
```bash
pnpm test
```

### E2E Tests (Playwright)
```bash
pnpm test:e2e
```

Test Coverage:
- `us1-load-mesh.spec.ts`: Mesh loading User Story
- `us2-overlays.spec.ts`: Overlay toggles
- `us3-preferences.spec.ts`: User preferences persistence

---

## 📄 License

MIT License

---

<div align="center">

**Questions or feedback? Please open an issue!**

</div>

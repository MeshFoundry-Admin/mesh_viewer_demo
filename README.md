# Mesh Viewer Demo

A web-based 3D mesh viewer application.

## Features

- Interactive 3D mesh visualization
- Support for various mesh file formats
- Real-time rendering with WebGL
- User-friendly interface

## Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn package manager

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd mesh-viewer-demo
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Open your browser and navigate to `http://localhost:3000`

## Usage

1. Upload a mesh file using the file input
2. The 3D viewer will automatically load and display the mesh
3. Use mouse controls to rotate, zoom, and pan the view

## Supported Formats

- OBJ
- PLY
- STL
- GLTF/GLB

## Development

### Project Structure

```
src/
├── components/     # React components
├── utils/         # Utility functions
├── types/         # TypeScript type definitions
└── assets/        # Static assets
```

### Building for Production

```bash
npm run build
```

## Contributing

Please read our contributing guidelines before submitting pull requests.

## License

This project is licensed under the MIT License.

Mesh Viewer Demo는 웹 기반 3D 메시 뷰어입니다.
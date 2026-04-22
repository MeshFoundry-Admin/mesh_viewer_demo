# Mesh Viewer Demo

A web-based 3D mesh viewer application built with modern web technologies.

## Features

- Interactive 3D mesh visualization
- Support for common 3D file formats
- Web-based interface for easy access
- Responsive design for various screen sizes

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
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
npm run dev
```

4. Open your browser and navigate to `http://localhost:3000`

## Usage

1. Upload a 3D mesh file using the file input
2. The mesh will be automatically rendered in the 3D viewport
3. Use mouse controls to rotate, zoom, and pan the view
4. Adjust rendering settings using the control panel

## Supported File Formats

- .obj (Wavefront OBJ)
- .stl (STereoLithography)
- .ply (Polygon File Format)
- .gltf/.glb (GL Transmission Format)

## Technology Stack

- **Frontend**: React, TypeScript
- **3D Graphics**: Three.js
- **Build Tool**: Vite
- **Styling**: CSS Modules

## Project Structure

```
src/
├── components/     # React components
├── hooks/         # Custom React hooks
├── utils/         # Utility functions
├── types/         # TypeScript type definitions
└── styles/        # CSS styles
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Three.js community for excellent 3D graphics library
- React team for the fantastic UI framework
- All contributors who have helped improve this project

Mesh Viewer Demo는 웹 기반 3D 메시 뷰어입니다.
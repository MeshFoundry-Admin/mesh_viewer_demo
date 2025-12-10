/**
 * JavaScript-based mesh parsers (for ASCII formats)
 * 
 * ASCII text parsing uses V8 engine's optimized split()/parseFloat(),
 * which is faster than WASM, so it's handled in JavaScript.
 * 
 * Binary formats are processed in WASM (byte manipulation is more efficient in C++).
 */

export interface JsParseResult {
  vertices: Float64Array;
  indices: Uint32Array;
  vertexCount: number;
  faceCount: number;
}

/**
 * Parses PLY file header to extract format information.
 */
export interface PlyHeader {
  format: 'ascii' | 'binary_little_endian' | 'binary_big_endian';
  vertexCount: number;
  faceCount: number;
  headerEndOffset: number;
}

export function parsePlyHeader(data: ArrayBuffer): PlyHeader {
  const decoder = new TextDecoder('ascii');
  const maxHeaderSize = Math.min(4096, data.byteLength);
  const headerText = decoder.decode(data.slice(0, maxHeaderSize));
  
  let format: PlyHeader['format'] = 'ascii';
  let vertexCount = 0;
  let faceCount = 0;
  let headerEndOffset = 0;
  
  const lines = headerText.split('\n');
  let offset = 0;
  
  for (const line of lines) {
    const lineWithNewline = line.length + 1; // +1 for \n
    const trimmed = line.trim().replace(/\r$/, '');
    
    if (trimmed.startsWith('format ')) {
      const parts = trimmed.split(/\s+/);
      if (parts[1] === 'binary_little_endian') format = 'binary_little_endian';
      else if (parts[1] === 'binary_big_endian') format = 'binary_big_endian';
      else format = 'ascii';
    } else if (trimmed.startsWith('element vertex ')) {
      vertexCount = parseInt(trimmed.split(/\s+/)[2], 10);
    } else if (trimmed.startsWith('element face ')) {
      faceCount = parseInt(trimmed.split(/\s+/)[2], 10);
    } else if (trimmed === 'end_header') {
      headerEndOffset = offset + line.length + 1; // include newline after end_header
      break;
    }
    
    offset += lineWithNewline;
  }
  
  return { format, vertexCount, faceCount, headerEndOffset };
}

/**
 * Parses ASCII PLY files.
 * Uses split() + parseFloat() similar to Three.js PLYLoader approach.
 */
export function parseAsciiPly(data: ArrayBuffer): JsParseResult {
  const text = new TextDecoder('utf-8').decode(data);
  const header = parsePlyHeader(data);
  
  // Extract data section
  const dataText = text.substring(header.headerEndOffset);
  const lines = dataText.split('\n');
  
  const vertices = new Float64Array(header.vertexCount * 3);
  const tempIndices: number[] = [];
  
  let lineIndex = 0;
  
  // Parse vertices
  for (let i = 0; i < header.vertexCount && lineIndex < lines.length; i++) {
    const line = lines[lineIndex++].trim();
    if (!line) { i--; continue; }
    
    const parts = line.split(/\s+/);
    vertices[i * 3] = parseFloat(parts[0]);
    vertices[i * 3 + 1] = parseFloat(parts[1]);
    vertices[i * 3 + 2] = parseFloat(parts[2]);
  }
  
  // Parse faces
  for (let i = 0; i < header.faceCount && lineIndex < lines.length; i++) {
    const line = lines[lineIndex++].trim();
    if (!line) { i--; continue; }
    
    const parts = line.split(/\s+/);
    const count = parseInt(parts[0], 10);
    
    if (count >= 3) {
      // Fan triangulation
      const first = parseInt(parts[1], 10);
      for (let j = 2; j < count; j++) {
        tempIndices.push(first);
        tempIndices.push(parseInt(parts[j], 10));
        tempIndices.push(parseInt(parts[j + 1], 10));
      }
    }
  }
  
  return {
    vertices,
    indices: new Uint32Array(tempIndices),
    vertexCount: header.vertexCount,
    faceCount: tempIndices.length / 3
  };
}

/**
 * Detects whether an STL file is ASCII or Binary format.
 */
export function isAsciiStl(data: ArrayBuffer): boolean {
  if (data.byteLength < 84) return true; // Too small for binary
  
  const view = new Uint8Array(data, 0, Math.min(256, data.byteLength));
  const header = new TextDecoder('ascii').decode(view);
  
  // Likely ASCII if starts with "solid" and has newline within first 256 bytes
  if (!header.toLowerCase().startsWith('solid')) return false;
  if (!header.includes('\n')) return false;
  
  // Binary STL check: 80-byte header + 4-byte triangle count
  const triangleCountView = new DataView(data, 80, 4);
  const triangleCount = triangleCountView.getUint32(0, true);
  const expectedSize = 84 + triangleCount * 50;
  
  // If size exactly matches binary format, it's binary
  if (expectedSize === data.byteLength) return false;
  
  return true;
}

/**
 * Parses ASCII STL files.
 */
export function parseAsciiStl(data: ArrayBuffer): JsParseResult {
  const text = new TextDecoder('utf-8').decode(data);
  const lines = text.split('\n');
  
  const tempVertices: number[] = [];
  const tempIndices: number[] = [];
  let vertexIndex = 0;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('vertex ')) {
      const parts = trimmed.split(/\s+/);
      tempVertices.push(
        parseFloat(parts[1]),
        parseFloat(parts[2]),
        parseFloat(parts[3])
      );
    } else if (trimmed === 'endfacet') {
      // Each facet has exactly 3 vertices
      tempIndices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2);
      vertexIndex += 3;
    }
  }
  
  return {
    vertices: new Float64Array(tempVertices),
    indices: new Uint32Array(tempIndices),
    vertexCount: tempVertices.length / 3,
    faceCount: tempIndices.length / 3
  };
}

/**
 * Parses OBJ files.
 * OBJ is always in ASCII format.
 */
export function parseObj(data: ArrayBuffer): JsParseResult {
  const text = new TextDecoder('utf-8').decode(data);
  const lines = text.split('\n');
  
  const tempVertices: number[] = [];
  const tempIndices: number[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const parts = trimmed.split(/\s+/);
    const prefix = parts[0];
    
    if (prefix === 'v') {
      tempVertices.push(
        parseFloat(parts[1]),
        parseFloat(parts[2]),
        parseFloat(parts[3])
      );
    } else if (prefix === 'f') {
      const faceIndices: number[] = [];
      
      for (let i = 1; i < parts.length; i++) {
        const vertexSpec = parts[i];
        // Handle v/vt/vn or v//vn or v format
        const slashIdx = vertexSpec.indexOf('/');
        const indexStr = slashIdx >= 0 ? vertexSpec.substring(0, slashIdx) : vertexSpec;
        let idx = parseInt(indexStr, 10);
        
        // Handle negative indices (counting from end)
        if (idx < 0) {
          idx = tempVertices.length / 3 + idx + 1;
        }
        
        faceIndices.push(idx - 1); // Convert to 0-based index
      }
      
      // Fan triangulation
      for (let i = 1; i < faceIndices.length - 1; i++) {
        tempIndices.push(faceIndices[0], faceIndices[i], faceIndices[i + 1]);
      }
    }
  }
  
  return {
    vertices: new Float64Array(tempVertices),
    indices: new Uint32Array(tempIndices),
    vertexCount: tempVertices.length / 3,
    faceCount: tempIndices.length / 3
  };
}

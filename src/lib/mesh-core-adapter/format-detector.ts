/**
 * Format Detector - Mesh File Format Detection
 * 
 * This module detects formats with the following priority:
 * 1. Magic Bytes (highest priority) - Inspects first 80 bytes of file
 * 2. Extension - .stl, .obj, .ply extensions
 * 3. MIME Header (fallback) - When provided by File API
 * 
 * @module format-detector
 */

import type { MeshFormat } from './types';

/**
 * Format detection result
 */
export interface FormatDetectionResult {
  /** Detected format */
  format: MeshFormat | null;
  /** Detection method */
  method: 'magic' | 'extension' | 'mime' | 'unknown';
  /** Extension and actual format mismatch */
  mismatch: boolean;
  /** Expected format based on extension (when mismatched) */
  expectedFormat?: MeshFormat;
}

/**
 * Detect PLY subformat
 */
function detectPlySubformat(header: Uint8Array): MeshFormat {
  const text = new TextDecoder().decode(header);
  const lowerText = text.toLowerCase();
  
  if (lowerText.includes('format binary_little_endian')) {
    return 'ply_binary_le';
  }
  if (lowerText.includes('format binary_big_endian')) {
    return 'ply_binary_be';
  }
  return 'ply_ascii';
}

/**
 * Detect format by Magic Bytes
 * 
 * @param header - File header (minimum 80 bytes)
 * @returns Detected format or null
 */
function detectByMagicBytes(header: Uint8Array): MeshFormat | null {
  if (header.length < 4) return null;
  
  // PLY: 'ply\n' or 'ply\r\n'
  if (header[0] === 0x70 && header[1] === 0x6C && header[2] === 0x79) {
    if (header[3] === 0x0A || header[3] === 0x0D) {
      return detectPlySubformat(header);
    }
  }
  
  // OBJ heuristic: starts with 'v ' or '# '
  const firstTwo = String.fromCharCode(header[0], header[1]);
  if (firstTwo === 'v ' || firstTwo === '# ') {
    return 'obj';
  }
  
  // STL ASCII: starts with 'solid' (case insensitive)
  const first5 = new TextDecoder().decode(header.slice(0, 5)).toLowerCase();
  if (first5 === 'solid') {
    // If newline follows 'solid', likely ASCII STL
    const hasNewline = header.slice(0, 80).includes(0x0A);
    if (hasNewline) {
      return 'stl';
    }
  }
  
  // STL Binary: 80-byte header + 4-byte triangle count
  if (header.length >= 84) {
    // Binary STL validation: header doesn't start with 'solid', or
    // file size matches 84 + 50*triangleCount
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const triangleCount = view.getUint32(80, true); // little-endian
    
    // Check if triangleCount is in reasonable range (1 ~ 100M)
    if (triangleCount > 0 && triangleCount < 100_000_000) {
      // If doesn't start with 'solid', it's binary STL
      if (first5 !== 'solid') {
        return 'stl_binary';
      }
    }
  }
  
  return null;
}

/**
 * Detect format by extension
 * 
 * @param fileName - File name
 * @returns Detected format or null
 */
function detectByExtension(fileName: string): MeshFormat | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  switch (ext) {
    case 'stl':
      return 'stl'; // Assume ASCII, binary check during actual load
    case 'obj':
      return 'obj';
    case 'ply':
      return 'ply_ascii'; // Assume ASCII, binary check during actual load
    default:
      return null;
  }
}

/**
 * Detect format by MIME type
 * 
 * @param mimeType - MIME type
 * @returns Detected format or null
 */
function detectByMime(mimeType: string): MeshFormat | null {
  const lower = mimeType.toLowerCase();
  
  if (lower.includes('stl') || lower === 'model/stl') {
    return 'stl';
  }
  if (lower.includes('obj') || lower === 'model/obj') {
    return 'obj';
  }
  if (lower.includes('ply')) {
    return 'ply_ascii';
  }
  
  return null;
}

/**
 * Detect mesh file format
 * 
 * @param file - File object
 * @returns Format detection result
 * 
 * @example
 * ```typescript
 * const result = await detectMeshFormat(file);
 * if (result.mismatch) {
 *   console.warn('Extension mismatch:', result.expectedFormat, '→', result.format);
 * }
 * ```
 */
export async function detectMeshFormat(file: File): Promise<FormatDetectionResult> {
  const result: FormatDetectionResult = {
    format: null,
    method: 'unknown',
    mismatch: false
  };
  
  // 1. Store expected format based on extension
  const extensionFormat = detectByExtension(file.name);
  
  // 2. Try detection by Magic Bytes (highest priority)
  try {
    const headerSize = Math.min(256, file.size);
    const headerBlob = file.slice(0, headerSize);
    const headerBuffer = await headerBlob.arrayBuffer();
    const header = new Uint8Array(headerBuffer);
    
    const magicFormat = detectByMagicBytes(header);
    if (magicFormat) {
      result.format = magicFormat;
      result.method = 'magic';
      
      // Check for extension mismatch
      if (extensionFormat && !isSameFormatFamily(extensionFormat, magicFormat)) {
        result.mismatch = true;
        result.expectedFormat = extensionFormat;
      }
      
      return result;
    }
  } catch {
    // Fallback to other methods if magic bytes read fails
  }
  
  // 3. Detect by extension
  if (extensionFormat) {
    result.format = extensionFormat;
    result.method = 'extension';
    return result;
  }
  
  // 4. Detect by MIME type (fallback)
  if (file.type) {
    const mimeFormat = detectByMime(file.type);
    if (mimeFormat) {
      result.format = mimeFormat;
      result.method = 'mime';
      return result;
    }
  }
  
  return result;
}

/**
 * Check if two formats belong to the same family
 * (e.g., stl and stl_binary are the same family)
 */
function isSameFormatFamily(a: MeshFormat, b: MeshFormat): boolean {
  const family = (f: MeshFormat): string => {
    if (f.startsWith('stl')) return 'stl';
    if (f.startsWith('ply')) return 'ply';
    return f;
  };
  return family(a) === family(b);
}

/**
 * Check if format is supported
 */
export function isSupportedFormat(format: MeshFormat | null): format is MeshFormat {
  if (!format) return false;
  const supported: MeshFormat[] = [
    'stl', 'stl_binary', 'obj', 'ply_ascii', 'ply_binary_le', 'ply_binary_be'
  ];
  return supported.includes(format);
}

/**
 * Extract base type from format (stl, obj, ply)
 */
export function getFormatFamily(format: MeshFormat): 'stl' | 'obj' | 'ply' {
  if (format.startsWith('stl')) return 'stl';
  if (format.startsWith('ply')) return 'ply';
  return 'obj';
}

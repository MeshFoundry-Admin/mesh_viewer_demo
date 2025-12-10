/**
 * File ID Generator
 * 
 * This module generates unique file IDs for distinguishing
 * metrics during concurrent file loads.
 * 
 * Priority:
 * 1. crypto.randomUUID() - supported by most modern browsers
 * 2. fallback: filename + timestamp hash
 * 
 * @module file-id
 */

/**
 * Simple hash function (for fallback)
 * 
 * Algorithm similar to Java's String.hashCode
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Generate unique file ID
 * 
 * @param fileName - original filename (used for fallback)
 * @returns UUID v4 or hash-based ID
 * 
 * @example
 * ```typescript
 * const id = generateFileId('model.stl');
 * // "550e8400-e29b-41d4-a716-446655440000" (UUID v4)
 * // or
 * // "file-1a2b3c4d" (fallback)
 * ```
 */
export function generateFileId(fileName?: string): string {
  // 1. Try crypto.randomUUID()
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Handle exceptions such as non-secure context
    }
  }

  // 2. UUID v4 fallback based on crypto.getRandomValues()
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    try {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      
      // Convert to UUID v4 format
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
      
      const hex = Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    } catch {
      // fallback
    }
  }

  // 3. Final fallback: filename + timestamp + random hash
  const seed = `${fileName || 'unknown'}-${Date.now()}-${Math.random()}`;
  const hash = hashCode(seed);
  return `file-${hash.toString(36)}`;
}

/**
 * Extract extension from filename
 */
export function getFileExtension(fileName: string): string | null {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1 || lastDot === fileName.length - 1) {
    return null;
  }
  return fileName.slice(lastDot + 1).toLowerCase();
}

/**
 * Extract filename without extension
 */
export function getFileBaseName(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) {
    return fileName;
  }
  return fileName.slice(0, lastDot);
}

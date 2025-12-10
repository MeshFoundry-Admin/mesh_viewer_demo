import { useCallback, useRef, useState } from 'react';
import { useViewerState } from '../hooks/use-viewer-state';
import { MAX_MESH_FILE_BYTES } from '@/lib/mesh-core-adapter';

const ACCEPTED_EXTENSIONS = ['.obj', '.stl', '.ply'];

function isAcceptedFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export interface FileDropzoneProps {
  onFileSelected?: (file: File) => void;
  disabled?: boolean;
}

export function FileDropzone({ onFileSelected, disabled = false }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const status = useViewerState((s) => s.status);
  const isLoading = status === 'Loading';

  const handleFile = useCallback(
    (file: File) => {
      if (disabled || isLoading) return;

      if (!isAcceptedFile(file)) {
        console.warn(`[dropzone] Unsupported extension: ${file.name}`);
        return;
      }

      if (file.size > MAX_MESH_FILE_BYTES) {
        console.warn(`[dropzone] File size exceeded: ${file.size} bytes`);
        return;
      }

      onFileSelected?.(file);
    },
    [disabled, isLoading, onFileSelected]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  const handleClick = useCallback(() => {
    if (!disabled && !isLoading) {
      inputRef.current?.click();
    }
  }, [disabled, isLoading]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
      // Reset input (allow re-selecting the same file)
      e.target.value = '';
    },
    [handleFile]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className={`file-dropzone ${isDragging ? 'dragging' : ''} ${isLoading ? 'loading' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClick();
        }
      }}
      aria-disabled={disabled || isLoading}
      data-testid="file-dropzone"
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        onChange={handleChange}
        style={{ display: 'none' }}
        aria-label="Select mesh file"
      />

      {isLoading ? (
        <div className="dropzone-loading">
          <span className="spinner" aria-hidden="true" />
          <p>Loading mesh...</p>
        </div>
      ) : (
        <div className="dropzone-idle">
          <p>Drag or click to select OBJ / STL / PLY file</p>
          <span className="hint">(Max 600 MB)</span>
        </div>
      )}
    </div>
  );
}

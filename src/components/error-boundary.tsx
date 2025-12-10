import React, { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Environment support check result
 */
export interface EnvironmentSupport {
  webgl: boolean;
  webgl2: boolean;
  wasm: boolean;
  indexedDB: boolean;
  sharedArrayBuffer: boolean;
  errors: string[];
}

/**
 * Check browser environment support
 */
export function checkEnvironmentSupport(): EnvironmentSupport {
  const support: EnvironmentSupport = {
    webgl: false,
    webgl2: false,
    wasm: false,
    indexedDB: false,
    sharedArrayBuffer: false,
    errors: [],
  };

  // Check WebGL support
  try {
    const canvas = document.createElement('canvas');
    support.webgl = !!(
      canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    );
    support.webgl2 = !!canvas.getContext('webgl2');
  } catch {
    support.webgl = false;
    support.webgl2 = false;
  }

  if (!support.webgl) {
    support.errors.push('WebGL is not supported. Please use a modern browser.');
  }

  // Check WASM support
  try {
    support.wasm = typeof WebAssembly !== 'undefined' && typeof WebAssembly.instantiate === 'function';
  } catch {
    support.wasm = false;
  }

  if (!support.wasm) {
    support.errors.push('WebAssembly is not supported. Please use a modern browser.');
  }

  // Check IndexedDB support
  try {
    support.indexedDB = typeof indexedDB !== 'undefined';
  } catch {
    support.indexedDB = false;
  }

  // Check SharedArrayBuffer support
  try {
    support.sharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  } catch {
    support.sharedArrayBuffer = false;
  }

  return support;
}

/**
 * Whether required environment requirements are met
 */
export function isEnvironmentSupported(): boolean {
  const support = checkEnvironmentSupport();
  return support.webgl && support.wasm;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  environmentSupport: EnvironmentSupport | null;
}

/**
 * Error Boundary Component
 * Handles React rendering errors and unsupported environments
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      environmentSupport: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidMount(): void {
    // Check environment support
    const support = checkEnvironmentSupport();
    this.setState({ environmentSupport: support });

    if (support.errors.length > 0) {
      this.setState({ hasError: true });
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);

    // Log error to console
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleRefresh = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { hasError, error, environmentSupport } = this.state;
    const { children, fallback } = this.props;

    // Unsupported environment state
    if (environmentSupport && environmentSupport.errors.length > 0) {
      return (
        <UnsupportedEnvironmentFallback
          support={environmentSupport}
          onRetry={this.handleRefresh}
        />
      );
    }

    // Error state
    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <DefaultErrorFallback
          error={error}
          onRetry={this.handleRetry}
          onRefresh={this.handleRefresh}
        />
      );
    }

    return children;
  }
}

interface UnsupportedEnvironmentFallbackProps {
  support: EnvironmentSupport;
  onRetry: () => void;
}

function UnsupportedEnvironmentFallback({
  support,
  onRetry,
}: UnsupportedEnvironmentFallbackProps) {
  return (
    <div className="error-fallback error-fallback--unsupported" data-testid="unsupported-environment">
      <div className="error-fallback__icon">⚠️</div>
      <h1 className="error-fallback__title">Browser Not Supported</h1>
      <p className="error-fallback__message">
        The following features are required to run Mesh Viewer Demo:
      </p>

      <ul className="error-fallback__requirements">
        <li className={support.webgl ? 'supported' : 'unsupported'}>
          {support.webgl ? '✓' : '✗'} WebGL
          {support.webgl2 && ' (WebGL2 supported)'}
        </li>
        <li className={support.wasm ? 'supported' : 'unsupported'}>
          {support.wasm ? '✓' : '✗'} WebAssembly
        </li>
        <li className={support.indexedDB ? 'supported' : 'supported-optional'}>
          {support.indexedDB ? '✓' : '○'} IndexedDB (for preference storage)
        </li>
      </ul>

      {support.errors.length > 0 && (
        <div className="error-fallback__errors">
          <h3>Detected Issues:</h3>
          <ul>
            {support.errors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="error-fallback__suggestions">
        <h3>Solutions:</h3>
        <ul>
          <li>Please use the latest version of Chrome, Firefox, Edge, or Safari.</li>
          <li>Make sure hardware acceleration is enabled.</li>
          <li>Some features may be limited in incognito/private mode.</li>
        </ul>
      </div>

      <button type="button" onClick={onRetry} className="error-fallback__btn">
        Retry
      </button>
    </div>
  );
}

interface DefaultErrorFallbackProps {
  error: Error | null;
  onRetry: () => void;
  onRefresh: () => void;
}

function DefaultErrorFallback({
  error,
  onRetry,
  onRefresh,
}: DefaultErrorFallbackProps) {
  const isBinaryPlyError = error?.message?.includes('binary_ply') ||
    error?.message?.includes('UnsupportedFormat');

  return (
    <div className="error-fallback" data-testid="error-fallback">
      <div className="error-fallback__icon">❌</div>
      <h1 className="error-fallback__title">An Error Occurred</h1>

      {isBinaryPlyError ? (
        <BinaryPlyNotice />
      ) : (
        <>
          <p className="error-fallback__message">
            {error?.message || 'An unknown error occurred.'}
          </p>
          {error?.name && (
            <p className="error-fallback__error-name">{error.name}</p>
          )}
        </>
      )}

      <div className="error-fallback__actions">
        <button type="button" onClick={onRetry} className="error-fallback__btn">
          Retry
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="error-fallback__btn error-fallback__btn--secondary"
        >
          Refresh Page
        </button>
      </div>

      <details className="error-fallback__details">
        <summary>Details</summary>
        <pre>{error?.stack || 'No stack trace available'}</pre>
      </details>
    </div>
  );
}

/**
 * Binary PLY unsupported notice component
 */
function BinaryPlyNotice() {
  return (
    <div className="error-fallback__binary-ply" data-testid="binary-ply-notice">
      <h2>Binary PLY format is not currently supported</h2>
      <p>
        This file is saved in Binary PLY format.
        Binary PLY parsing is disabled in the current build.
      </p>

      <div className="error-fallback__alternatives">
        <h3>Alternatives:</h3>
        <ul>
          <li>Re-export the file in ASCII PLY format</li>
          <li>Convert to OBJ or STL format</li>
          <li>Format conversion is available using tools like MeshLab or Blender</li>
        </ul>
      </div>
    </div>
  );
}

/**
 * Environment Gate HOC
 * Does not render children if required environment requirements are not met
 */
interface EnvironmentGateProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function EnvironmentGate({ children, fallback }: EnvironmentGateProps) {
  const [support, setSupport] = React.useState<EnvironmentSupport | null>(null);

  React.useEffect(() => {
    setSupport(checkEnvironmentSupport());
  }, []);

  if (!support) {
    return null; // Checking
  }

  if (!support.webgl || !support.wasm) {
    return fallback ? (
      <>{fallback}</>
    ) : (
      <UnsupportedEnvironmentFallback support={support} onRetry={() => window.location.reload()} />
    );
  }

  return <>{children}</>;
}

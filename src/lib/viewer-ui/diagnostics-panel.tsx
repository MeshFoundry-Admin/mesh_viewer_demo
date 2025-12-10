import type { FC, ReactNode } from 'react';

export interface DiagnosticsPanelProps {
  title?: string;
  children?: ReactNode;
}

export const DiagnosticsPanel: FC<DiagnosticsPanelProps> = ({
  title = 'Diagnostics',
  children
}) => {
  return (
    <section className="viewer-diagnostics-panel">
      <header>
        <h3>{title}</h3>
      </header>
      <div className="viewer-diagnostics-body">{children ?? <p>Waiting for logs…</p>}</div>
    </section>
  );
};

'use client';

/**
 * Global error boundary — replaces the root layout when the root itself throws,
 * so it must render its own <html>/<body> with inline styles (globals.css is
 * not applied here). (issue #41)
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          display: 'flex',
          minHeight: '100vh',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Something went wrong</h1>
        <p>A critical error occurred. Please reload the page.</p>
        {error.digest ? (
          <p style={{ fontSize: '0.75rem', opacity: 0.7 }}>Reference: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.375rem',
            border: '1px solid #ccc',
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}

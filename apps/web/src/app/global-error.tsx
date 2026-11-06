"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" data-theme="dark">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#071018",
          color: "#EAF6FF",
          fontFamily: "system-ui, sans-serif",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <div
          style={{
            border: "1px solid #1E3A4F",
            borderRadius: "16px",
            background: "#0D1B27",
            padding: "2.5rem",
            maxWidth: "420px",
          }}
        >
          <p
            style={{
              fontFamily: "monospace",
              fontSize: "11px",
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              color: "#00E5FF",
            }}
          >
            AVI SYSTEM ERROR
          </p>
          <h1 style={{ fontSize: "18px", marginBottom: "8px" }}>
            Avi could not start this session.
          </h1>
          <p style={{ fontSize: "13px", color: "#93A9BA", marginBottom: "16px" }}>
            Reload to reconnect; your saved data stays on this device.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#00E5FF",
              color: "#071018",
              border: "none",
              borderRadius: "10px",
              padding: "8px 16px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload Avi
          </button>
          {error.digest && (
            <p style={{ marginTop: "12px", fontSize: "10px", color: "#5E788C" }}>
              Error ref: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}

"use client";

import { PALETTE } from "@/lib/palette";

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
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: PALETTE.background,
          color: PALETTE.text,
          fontFamily: "system-ui, sans-serif",
          padding: "2rem",
          textAlign: "center",
          colorScheme: "dark",
        }}
      >
        <div
          style={{
            border: `1px solid ${PALETTE.border}`,
            borderRadius: "16px",
            background: PALETTE.surface,
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
              color: PALETTE.accent,
            }}
          >
            AVI SYSTEM ERROR
          </p>
          <h1 style={{ fontSize: "18px", marginBottom: "8px" }}>
            Avi could not start this session.
          </h1>
          <p style={{ fontSize: "13px", color: PALETTE.muted, marginBottom: "16px" }}>
            Reload to reconnect; your saved data stays on this device.
          </p>
          <button
            onClick={reset}
            style={{
              background: PALETTE.accent,
              color: PALETTE.background,
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
            <p style={{ marginTop: "12px", fontSize: "10px", color: PALETTE.subtle }}>
              Error ref: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}

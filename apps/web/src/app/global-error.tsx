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
          padding: "1.5rem",
          textAlign: "center",
          colorScheme: "dark",
        }}
      >
        <div
          style={{
            border: `1px solid ${PALETTE.border}`,
            borderRadius: "14px",
            background: PALETTE.surface,
            padding: "2rem",
            maxWidth: "420px",
            width: "100%",
          }}
        >
          <p
            style={{
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: PALETTE.accent,
              margin: 0,
            }}
          >
            System error
          </p>
          <h1 style={{ fontSize: "20px", margin: "10px 0 6px", fontWeight: 600 }}>
            AeroQuest could not start this session.
          </h1>
          <p
            style={{
              fontSize: "14px",
              lineHeight: 1.6,
              color: PALETTE.muted,
              margin: "0 0 20px",
            }}
          >
            Reload to reconnect. Your saved data stays on this device.
          </p>
          <button
            onClick={reset}
            style={{
              background: PALETTE.accent,
              color: PALETTE.background,
              border: "none",
              borderRadius: "8px",
              minHeight: "44px",
              padding: "0 20px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload AeroQuest
          </button>
          {error.digest && (
            <p
              style={{
                marginTop: "14px",
                marginBottom: 0,
                fontSize: "11px",
                color: PALETTE.subtle,
              }}
            >
              Error ref: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
